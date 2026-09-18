# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm install              # install deps (also runs scripts/fix-express-tsconfig.cjs via postinstall)
npm run dev               # next dev --turbopack
npm run build              # production build
npm run lint                # eslint . --ext .js,.jsx,.ts,.tsx (includes the jsdoc rules — see "Code documentation standard" below)
npm run lint:fix
npm run lint:md              # markdownlint over **/*.md
npm run format                # prettier --write . (excludes *.md — markdownlint owns that)
npm run format:check           # prettier --check .
npm run type-check               # tsc --noEmit
npm run docs:code                 # typedoc -> docs-generated/ (gitignored); regenerate on demand, see "Code documentation standard" below
npm run test                       # jest
npm run test:watch
npm run test:coverage               # jest --coverage (enforces 80% global threshold — see jest.config.cjs)
npm run analyze                      # ANALYZE=true next build (bundle analysis)
npm run docs:api                      # regenerate public/openapi.json from @swagger JSDoc comments; runs automatically before dev/build
npm run db:check                       # read-only check that schema.ts matches the live DB; runs automatically before dev and as part of ci
npm run ci                             # format (auto-fix) && lint --max-warnings=0 && lint:md && type-check && db:check && docs:code && test:coverage && build — run this before considering work done
```

`npm run ci`'s local composite deliberately runs `format` (auto-`--write`) as its very
first step, not `format:check` — added 2026-09-17 after formatting drift on files
untouched by Prettier during a session kept surfacing only at the very end of a full
`npm run ci` run (after lint/type-check/the full test suite had already passed),
forcing a wasted second full run just to fix formatting. Auto-fixing first means every
later step in the local gate runs against already-correctly-formatted code, so it can
never fail on formatting again. `.github/workflows/ci.yml`'s own "Check formatting"
step stays a `format:check` (not `--write`) and was moved to run first there too (fail
fast, cheapest check first) — that workflow can't push a fix back to the PR it's
checking, so it must fail loudly on drift rather than silently paper over it. The
pre-commit hook (`.githooks/pre-commit`, wired via `npm run prepare`) is the third
layer: it auto-formats whatever's staged before a commit even exists, so drift
ideally never reaches either `npm run ci` or GitHub Actions in the first place.

Run a single test file: `npx jest tests/api/chat.test.ts`
Run tests matching a name: `npx jest -t "some test description"`

Coverage is enforced globally at 80% (branches/functions/lines/statements) in `jest.config.cjs` — `npm run test:coverage` fails the build if it drops below that.

## Architecture

Next.js 16 (Pages Router API + App Router UI) app. UI in `app/`, API routes in `pages/api/` (deliberately Pages Router, not App Router route handlers — server handlers are authoritative here).

### Request flow

`app/components/useChatController.ts` → `authenticatedFetch()` (`src/utils/api.ts`) → `pages/api/chat.ts`. Every client→server call should go through `authenticatedFetch`, not raw `fetch`, so it passes through `proxy.ts` auth and so tests can mock it consistently.

`proxy.ts` is the single choke point for API auth: it validates request origin (localhost, Vercel production/preview auto-pass) and enforces a constant-time-compared `x-api-key` against `API_SECRET` for external origins. Adding a new deployment domain means updating `allowedHosts` in `proxy.ts` — nowhere else. Host matching is exact (never prefix or substring), and a request with no `Origin`/`Referer` only passes on a safe method (GET/HEAD/OPTIONS) from a first-party host — everything else needs the API key. `tests/proxy.test.ts` pins both directions. **Important caveat, see "Security posture" below:** the Origin/Referer check is real CSRF protection against a browser (JS can't override `Origin`), but is not authentication against a non-browser client, which can set that header to anything it wants.

### Chat + streaming (`pages/api/chat.ts`)

The most complex endpoint: calls Claude, summarizes conversation history once it exceeds 20 messages (`src/utils/conversationSummarizer.ts` — see phase 3c below for how this differs for a signed-in user's saved character), streams via SSE when the client passes `{ stream: true }`, and does "smart continuation" — detects a truncated model response, appends a "Would you like me to continue?" prompt, and resumes seamlessly if the user says yes.

SSE frames are plain `data: JSON\n\n` — not a custom binary protocol. Final payload shape consumed by the client: `{ reply: string, audioFileUrl?: string, done: true }`. Changing that shape requires updating `useChatController.ts` and every test that parses stream frames.

If a reply requests TTS, the handler calls `src/utils/tts.ts` (`synthesizeSpeechToFile`), keyed by a stable `getAudioCacheKey` hash to avoid re-synthesizing identical audio. A TTS failure (cache-hit, non-streaming, and streaming paths) never fails the chat request — it degrades to a text-only reply (`audioFileUrl` omitted) rather than the 500 it used to be, since losing audio is much better than resurfacing a stale error and discarding an already-generated reply. `synthesizeSpeechToFile` also self-heals a voice `name`/`ssmlGender` mismatch: Google's rejection message names the voice's actual gender (`"Requested male voice, but voice X is a female voice"`), so on that specific error the request retries once with the corrected `ssmlGender` before falling through to the normal transient-failure retry loop — this is what lets an already-persisted, pre-fix `voiceConfig` (saved before `characterVoices.ts`'s gender-derivation fix) actually produce audio again without a data migration.

### Model selection (`src/utils/claudeModelSelector.ts`)

Three tiers, chosen by call site, not by any runtime cost heuristic:

- `"text"` — chat replies only. `claude-sonnet-4-6` in prod, `claude-haiku-4-5-20251001` in dev.
- `"text-simple"` — one-shot structured JSON tasks (personality generation, character validation, voice config, suggestion lists). Always `claude-haiku-4-5-20251001`, prod or dev.
- `"image"` — avatar prompts render via `gemini-3.1-flash-lite-image` on Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI; not Claude).

All Claude calls go through the singleton client in `src/utils/anthropicClient.ts`.

### Copyright/trademark validation

Bot creation is gated by a validation round-trip, not just a client-side check:

1. `useBotCreation.ts` calls `POST /api/validate-character` with `{ characterName }` before creating the bot.
2. `pages/api/validate-character.ts` uses Claude (rate-limited 30 req/min) to classify `{ level: "warning" | "caution" | "none", message?, suggestions? }` — "warning" = clear violation (Mickey Mouse), "caution" = possible trademark concern (Superman), "none" = safe.
3. On warning/caution, `CopyrightWarningModal.tsx` displays the message plus public-domain alternatives pulled from `GET /api/random-character` (pre-1928/mythology/historical figures, with explicit prompt guardrails against modern copyrighted names).

Changing this flow touches both the API and modal, plus `tests/api/validateCharacter.test.ts` and `tests/app/components/CopyrightWarningModal.test.tsx` — keep coverage ≥80%.

**A "warning" is checked against, and written to, three persistent tables before/after the Claude call — added 2026-09-17 after a live report that an already-cached, already-public character (Alice Munro) popped a fresh copyright warning on a later launch.** The root cause: `validate-character.ts` re-classifies every name from scratch via a non-deterministic Claude call (`temperature: 0`, tuned down from `0.3` as part of this fix) with zero awareness of what's already publicly cached — unlike `generate-personality.ts`'s fuzzy name-matching against `avatar_cache`.

- **`src/utils/characterAllowlist.ts`** (`character_allowlist` table) — a fast, *permanent* circuit-breaker checked first, before Claude is ever called. Backed by two sources: the static curated list reused from `src/data/characterNames.ts` (the same "1000+ public domain characters" list already trusted for random character selection and the guessing game's pool) plus an admin-managed DB table for anything not on that list. Added after a live sweep showed Claude flagging `"warning"` on names from that static list (Sherlock Holmes, Thor, Winnie-the-Pooh) purely because a studio also made a popular adaptation of a mythological/historical/pre-1928 figure — a single non-deterministic roll should never override a name this app already hand-vetted as safe. A hit also self-heals (removes) any stale blocklist entry for the same name.
- **`src/utils/characterBlocklist.ts`** (`character_blocklist` table) — checked next (only reached if the allowlist misses). A hit skips the Claude call entirely, scrubs any leftover cached avatar, and returns a hard, non-overridable block with a generic message (`scrubbed: true` — see below). Rows are added automatically the moment Claude classifies *any* name `"warning"` (`source: "claude"`, fire-and-forget so it never adds latency to the triggering request) — but that classification's own ordinary overridable warning flow still runs for *that one* first attempt; only a *repeat* attempt against the now-blocklisted name gets the fast, hard block. Rows can also be added/removed manually by an admin (`source: "admin"`) via `/admin/moderation` (below).
- **`src/utils/characterWarningLog.ts`** (`character_warning_log` table) — a separate, *append-only* record of every "warning"-level classification Claude has ever returned, written alongside (not instead of) the blocklist auto-add above. Deliberately not deduplicated like the allow/blocklist tables: once a name is un-blocked or allowlisted it disappears from those, so only this log can answer "what has Claude flagged in the last day/week/month" — it backs `/admin/moderation`'s "Recently warned" panel.
- **`/admin/moderation`** (`app/admin/moderation/`, `AdminModerationView.tsx`) is one combined admin page — not separate `/admin/allowlist`/`/admin/blocklist` pages — with three sections: "Recently warned" (read-only, time-window filterable: hour/24h/7d/30d/all, `GET /api/admin/warnings`, with inline Allow/Block buttons per row), "Allowed", and "Blocked" (both full CRUD via `POST`/`DELETE` on `pages/api/admin/{allowlist,blocklist}.ts`, plus a "Move to X" transfer button). A name is never on both lists at once — each list's `POST` handler also removes the name from the other table server-side, which is what makes both the transfer button and the Warning Log's Allow/Block buttons work (they just `POST` to the target list). A `refreshKey` counter in `AdminModerationView`, bumped by any successful mutation anywhere on the page, is a dependency of every section's fetch effect so a change in one section (e.g. transferring a name) is reflected by its sibling immediately, without a manual reload. Reuses the shared `AppHeader`/`useAccountMenu` chrome, same as every other page — `app/admin/AdminStatsView.tsx` was also migrated from its own bespoke masthead to this shared chrome as part of the same pass. Its table uses `table-layout: fixed` with ellipsis truncation to keep every row one line at any width, and drops the Reason/Source/Added columns entirely below 640px (icon-only actions, `aria-label`/`title` kept for accessibility) — two earlier mobile approaches (a horizontally-scrollable table, then a stacked-card layout per row) were tried and rejected as clunky/unwieldy before landing on this.
- **The copyright-classification prompt was hardened, not just gated.** It now explicitly separates "a name only meaningful because of one specific corporate work" (`warning` — Spider-Man, Pikachu) from "a mythological deity/historical person/pre-1928 work a studio also happens to have adapted" (`none`, even if a popular adaptation exists), with worked examples (Thor, Sherlock Holmes, Winnie-the-Pooh, Hercules) directly in the system prompt — same "worked counter-example" pattern already used to fix the guessing game's Hamlet/Laertes classifier bug (see "Guessing game" below).
- **`scrubbed: true`** on `CharacterValidationResult` means either of the above happened (blocklist hit, or a fresh "warning" for a name that was already cached) — `useBotCreation.ts` treats it as a hard stop with a generic message ("This character is no longer available"), the same non-overridable shape as `blocked`, never showing `CopyrightWarningModal`'s "Continue Anyway".
- **`scripts/scrub-copyrighted-avatar-cache.cjs`** (`npm run chars:scrub-copyrighted`, optionally `--dry-run`) is the one-time retroactive sweep: classifies every existing `avatar_cache` row in a single Claude call (not batched — this app's cached-character count is hobby-scale), blocklists and deletes anything flagged `"warning"`. Not run automatically, and not run as of this writing — a real `--dry-run` against production flagged Sherlock Holmes/Thor/Winnie-the-Pooh (the exact false positives that motivated the allowlist/prompt fixes above) alongside genuine violations, so it was deliberately held pending those fixes rather than trusted blind.

**Abusive names, and now living-person legal risk, are a separate, non-overridable check on the same response.** `CharacterValidationResult` also carries `blocked: boolean`, set by the same Claude call from two independent instructions, entirely separate from copyright status: (1) "is this name itself profane/a slur/sexually explicit," and (2) added 2026-09-17 after a live report — "does this name identify a real, currently-living person with a serious, well-documented real-world criminal conviction or extensive credible allegations of serious criminal conduct." The second check is deliberately narrow: it never applies to historical/deceased figures (however controversial — the app must not exclude legitimate historical characters) or ordinary celebrity/political controversy, only serious real-world criminal conduct by someone still alive today, with Bill Cosby as the prompt's own worked example (the live report that motivated this). Unlike `warningLevel`, there is no "Continue Anyway" for `blocked: true` either way — `useBotCreation.ts`'s `handleCreate` short-circuits straight to a plain error message before ever showing `CopyrightWarningModal`. This exists because every created character's name (and portrait) ends up on the public `/chars` gallery — a copyright concern is the user's own legal risk to accept, but neither an abusive name nor a legally-risky living-person impersonation is something the app can let exist publicly (or even privately, in a signed-in user's own saved characters) at all. On any validation error, `blocked` defaults to `false` (fail open, same as `warningLevel: "none"` there) rather than blocking creation when Claude is unreachable.

- **`character_blocklist` rows now carry a `category`** (`"copyright"` | `"content"`, `src/db/schema.ts`) distinguishing which of `validate-character.ts`'s two hard-block-eligible checks a row belongs to, since a repeat-attempt fast-path hit against the blocklist needs a different response shape for each: `"copyright"` (a made-permanent, still-nominally-"warning"-shaped) `warningLevel: "warning"` + `scrubbed: true`, versus `"content"` (abusive name, or the new living-person check) → `blocked: true` directly. A fresh `blocked: true` classification is now persisted to the blocklist exactly like a copyright "warning" already was (`category: "content"`) — previously `blocked: true` results were never persisted at all, so a repeat attempt against an already-abusive name relied on Claude's non-deterministic classification catching it again every single time. Legacy rows (written before this column existed) default to `"copyright"`, preserving their original behavior.
- **Blocking a name — automatically via Claude, or manually via `/admin/moderation` — now scrubs it everywhere, not just the shared cache.** `src/utils/avatarGeneration.ts`'s `scrubUserBotsByName` (new, alongside the existing `scrubCachedAvatar`) deletes every signed-in user's own saved `bots` row matching the name case-insensitively, across every user and environment; `messages` rows cascade-delete automatically via their FK to `bots.id`. Added alongside the living-person guardrail: a user's own private saved copy of a now-blocked name (and its full chat history) is a real concern independent of whether that name was ever on the public Character Wall. `pages/api/admin/blocklist.ts`'s manual-add endpoint also gained an immediate scrub call — previously it only prevented *future* generations, leaving an already-cached/saved name fully visible until someone happened to re-trigger `validate-character` for that exact name again. A manual admin add defaults to `category: "content"` (Claude's own classification already auto-handles the copyright category, so a manual add is far more likely covering that gap) unless the request explicitly passes `category: "copyright"`.

**Overriding a warning/caution never persists anything server-side.** `useBotCreation.ts` captures whether the run reached `handleCreate` via `handleValidationContinue` (i.e. the user clicked "Continue Anyway") into a `skipPersistence` flag that rides along on the `Bot` object itself, all the way through: `POST /api/generate-avatar` gets `{ skipPersistence: true }` and, when set, never reads or writes the shared `avatar_cache` table and never uploads to Vercel Blob (returns the raw base64 data URL instead of a durable link) — see `pages/api/generate-avatar.ts`'s `bypassPersistence`. `app/index.tsx`'s `handleBotCreated` checks `bot.skipPersistence` before its usual fire-and-forget `POST /api/bots`, so the character never lands in that signed-in user's own `bots` row either — it behaves exactly like a guest's character for that session (localStorage only). `ChatHeader.tsx` also hides the Download Transcript button for such a bot, so no durable artifact of the session leaves the app. `CopyrightWarningModal.tsx`'s disclaimer text tells the user this up front. None of this touches personality or voice generation — those were never cached/persisted per-name to begin with.

### Original characters (unrecognized names)

`validate-character.ts`'s single Claude call also classifies a third, independent concern — `recognized: boolean` — is this name an actual character/person Claude has real knowledge of, or does it just look like a plausible name (an invented/original character)? Defaults `true` on any validation error (fail open, same as `blocked`/`warningLevel` there).

1. When `recognized === false` (and the name isn't blocked/warning/caution — those checks run first and take priority), `useBotCreation.ts` shows `CharacterDescriptionModal.tsx` instead of proceeding straight to generation: a "Personality & background" field (required) and an optional "Appearance" field, both capped at 500 chars and sanitized by `sanitizeDescription` (`src/utils/security.ts` — strips angle brackets and backticks; unlike `sanitizeCharacterName` this keeps quotes/punctuation since it's prose). There's no "skip" option — the user either fills in the description or cancels back to the input; this is deliberate, since generating a personality from just a made-up name is exactly the bad experience this feature exists to fix.
2. Submitting calls the same `handleCreate()` pipeline (`proceedWithoutValidationRef` skips re-validation, mirroring the copyright-override flow), threading `description`/`appearance` through to `generateBotDataWithProgressCancelable`.
3. `POST /api/generate-personality` takes an optional `description` and, when present, builds the personality primarily from it rather than the name — see `generatePersonalityPrompt` in `src/config/serverConfig.ts`. The description is untrusted user input fed into a Claude prompt: it's clearly demarcated as creative-writing content (never instructions), and Claude is told to disregard any unsafe request inside it (sexual content involving minors, hate speech, real-world violence instructions, etc.) and set `descriptionRejected: true` instead of complying — in which case the raw description is never folded into the final persisted prompt at all, only the (safe) structured fields Claude derived from it.
4. `POST /api/generate-avatar` takes an optional `appearanceDescription`, incorporated into the Claude image-prompt call the same untrusted-content way (plus the endpoint's existing real-person/copyrighted-design guardrails), and a `recognized` flag (default `true`) — see below for what that controls.

### Avatar generation (`pages/api/generate-avatar.ts`)

**Avatar generation runs on free image providers only — no payment method required at all** (the earlier Gemini/Vertex path was fully removed). Two-stage: Claude (`text-simple` tier) writes a detailed, SFW image-description prompt from the character name (and `appearanceDescription`, if supplied — see above), then an image is rendered by whichever free provider succeeds first:

1. **Cloudflare Workers AI** (`src/utils/cloudflareImageGen.ts`, model `@cf/black-forest-labs/flux-1-schnell`) — tried first when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are both set. Free tier: 10,000 "neurons"/day, no payment info required; a Workers Paid plan (not configured here) would be needed to go past that, so requests simply start failing once the daily allocation is exhausted rather than silently incurring cost.
2. **Pollinations.ai** (`src/utils/pollinationsImageGen.ts`) — free, anonymous, no API key, no comparable daily cap. Used whenever Cloudflare isn't configured, errors, or is rejected by its own safety filter, so it's also what runs immediately if `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` are simply unset (e.g. a fresh clone with no Cloudflare account). Its anonymous tier may render a small "pollinations.ai" watermark into the image — there's no free-tier way to suppress that.

Each provider function returns `null` on any failure (missing config, non-2xx response, safety filter, empty body) rather than throwing, so the handler's `if (!avatarUrl)` fallthrough is what actually chains them — same degrade-gracefully shape as the Blob upload and avatar-cache logic below. If `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` is set, the resulting image is uploaded to Vercel Blob (`avatars/<uuid>.<ext>`, public access) and a durable Blob URL is returned; otherwise (no token configured, e.g. local dev with no Blob store) it falls back to a base64 data URL. Blob upload failures don't fail the request — they fall back to the data URL too. Rate-limited to 5 req/min/IP since image generation calls are comparatively expensive to redo.

**Both providers' `fetch()` calls carry a 25s `AbortSignal.timeout`.** Plain `fetch()` has no default timeout of its own, and a stalled request (most plausible on Pollinations — anonymous, unauthenticated, no daily-cap protection) used to hang the calling `await` forever rather than ever reaching the try/catch that degrades gracefully. Found live via the guessing game's `/api/game/start` (which calls this same pipeline in-process — see "Guessing game" below) getting stuck indefinitely in dev.

**`recognized: false` (an original character) is excluded from the shared `avatar_cache` table, but still gets a durable Blob upload.** This is a narrower bypass than `skipPersistence` (the copyright-override flag): an original character's name/portrait means something only to its own creator — sharing it cross-user by name (like every other cached avatar) would be actively wrong, not just wasteful — but unlike a copyright override, there's no reason to deny the creator their own durable, saved avatar. `bypassSharedCache` (`skipPersistence === true || recognized === false`) gates only `getCachedAvatar`/`cacheAvatar`; the separate `bypassPersistence` (`skipPersistence === true` alone) still gates the Blob upload, unchanged.

**Fuzzy name matching happens one step earlier, in `pages/api/generate-personality.ts`** — before an avatar is ever generated, so a misspelling reuses the existing cache row instead of spawning a duplicate. `generatePersonalityPrompt` (`src/config/serverConfig.ts`) fetches up to 300 existing `avatar_cache` names (`fetchExistingCharacterNames`, newest first, no-op without `DATABASE_URL`) and folds them into the *same* Claude call that already generates the personality, asking it to return a `correctedName`: the input with spelling/casing fixed, or — when the input is clearly a misspelling or minor variant of one of those existing names — that exact existing name instead. This is a single reused call, not an extra round trip. `correctedName` then flows through unchanged to `/api/generate-avatar`, whose `avatarCacheKey()` lowercases it for the lookup — so "sherlok holmes" naturally hits the same row as an existing "Sherlock Holmes" rather than creating "sherlok holmes" as a second, permanently-misspelled entry.

**`avatarCache.displayName`** (`src/db/schema.ts`) stores that properly-cased `correctedName` at write time (`cacheAvatar` in `generate-avatar.ts`) — the one place the correct casing is actually known, since Claude produced it. `pages/api/chars.ts` prefers this column over its own regex-based `toDisplayName` reconstruction, which is necessarily lossier (it can't know "III" should stay uppercase, or that "of"/"van"/"da" stay lowercase mid-name, purely from a lowercased string). Nullable — rows written before this column existed fall back to the regex reconstruction; `scripts/backfill-avatar-display-names.cjs` (`npm run chars:backfill-display-names`, optionally `--dry-run`) asks Claude to fill in `display_name` for any row still missing one, same opt-in-cleanup shape as `chars:reclassify` below.

### Character Wall (`/chars`)

A public, no-auth gallery of every *recognized* portrait in the shared `avatar_cache` — every actual character/person name and AI-generated portrait this app has ever produced, on one page. Nothing here is per-user data; a row is already discoverable by anyone who types that exact name into the creator, so listing them publicly discloses nothing new. Original characters (see "Original characters" above) are excluded — `pages/api/chars.ts` filters `WHERE recognized = true` — since an invented name/portrait means something only to the person who made it up, not to a visitor browsing a "characters anyone can chat with" wall. Rows written before the `recognized` column existed default to `true` (non-destructive: nothing existing silently disappears); `scripts/reclassify-avatar-cache.cjs` (`npm run chars:reclassify`, optionally `--dry-run`) re-runs the recognized classification over already-cached names for anyone who wants that historical cleanup — not run automatically, since it costs a Claude call per batch against shared production data and changes what's publicly visible.

- **`pages/api/chars.ts`** — `GET`-only, paginated (`limit`/`offset`, default 60, max 100, `hasMore` in the response). Backed by an in-process cache of the full row list with a 60s TTL (`getAllCharacters()`), so infinite-scroll pagination from many concurrent visitors costs at most one `avatar_cache` table scan per minute per warm instance, not one query per page fetch. Per-instance only (resets on cold start, not shared across serverless instances) — the same tradeoff class as the rate limiter's default MemoryStore; sharing it across instances would mean pulling in the Redis store already wired up in `rateLimitStore.ts`, not worth it for data that changes this slowly.
- **`app/components/CharsGallery.tsx`** — renders the gallery as a scrapbook/corkboard collage, not a grid: `display:flex; flex-wrap` with each polaroid-style tile given a size, rotation angle, and pushpin color chosen by an independent hash of the character's name (`hashString` — djb2), so the scatter looks hand-placed and stays stable across reloads/pagination rather than reshuffling. Infinite scroll via a callback ref + `IntersectionObserver` on a sentinel div — a callback ref, not a plain `useRef`+`useEffect` pair, because the sentinel `<div>` only exists once `characters.length > 0`; an effect keyed on `loadMore` would attach once at mount (while the ref is still `null`) and never re-attach once the sentinel actually appears, since `loadMore`'s identity doesn't change at that point. A native `<dialog>` (`showModal()`/`close()`) is the click-through lightbox — free focus-trapping and Escape-to-close, no modal library — opened/closed inside `document.startViewTransition()` when the browser supports it (feature-detected; no-op fallback otherwise) for a cross-fade instead of a hard cut. Its header is the same shared `AppHeader` the landing page uses (see "Unified header" below) — the header's center slot holds a `BackHomeLink` pill button in place of the landing page's character carousel, and `useAccountMenu()`'s items (identity label, change name, sign in/out, admin) live in the plain hamburger dropdown on the right, same as every other page.
- **"Chat with this character" launches straight into a chat, not the landing page.** The lightbox's link is `/?name=<encoded name>` — the exact same launch point `BotCreator.tsx` already reads via `useSearchParams()`. Landing on that URL never shows the ordinary creator form (input, Random button, footer links): `BotCreator`'s `isLaunchingFromUrl` flag hides all of it in favor of a bare loading spinner, so the transition reads as "opening a chat," not "landing on the creator page, which then happens to fill itself in." Resolution order once there:
  1. Signed in + a saved `bots` row with that exact name (case-insensitive) already exists → resume it via the same `persistedBotToBot()` mapping `ResumeBotDropdown` uses (exported from `ResumeBotDropdown.tsx` alongside `PersistedBot`), so it's the user's actual saved personality/voice/avatar, not a fresh regeneration.
  2. Otherwise (guest, or no saved match) → falls through to the ordinary `handleCreate()` generation pipeline.
  - **StrictMode footgun already fixed once, don't reintroduce it:** the guard ref (`hasAutoSubmittedRef`) is set synchronously *before* the `/api/bots` lookup's `await` resolves. React 18 StrictMode runs every effect twice in dev (mount → cleanup → mount again) without resetting refs in between; if the cleanup ran while that fetch was still in flight, the first invocation's result got silently dropped (`cancelled` check) while the second invocation saw the guard already set and bailed — so *nothing* ever called `onBotCreated`/`handleCreate`, and the launch hung on the loading screen forever. Fixed by tracking a local `dispatched` flag and only releasing the guard in the effect's cleanup when nothing was actually dispatched yet. `tests/app/components/BotCreator.url.test.tsx` has a dedicated regression test that renders inside `<React.StrictMode>` to pin this.
- **Profanity is blocked before a name can ever reach this page** — see the `blocked` field described in the copyright-validation section above.

### Client-side storage

`src/utils/storage.ts` wraps `localStorage` with an in-memory fallback (used in tests). Known keys: `chatbot-bot`, `chatbot-history-<bot.name>`, `voiceConfig-<bot.name>` (versioned — use the versioned helpers in `storage.ts`, never write the shape directly), `audioEnabled`, `darkMode`, `bot-session-id`, `chatbot-user-name` and `chatbot-user-name-gate-skipped` (the visitor's own preferred name and whether they've dismissed the name gate — see "Personalized greeting" below), and `chatbot-game-token`/`chatbot-game-transcript`/`chatbot-game-instructions-seen` (the guessing game's current round token, its transcript, and its one-time "how to play" gate — see "Guessing game" below). Never store secrets or PII here; it's client-side only.

### Guessing game (in progress — see issue tracking the feature for current status)

A second mode alongside ordinary chat, built as a chain, developed on `feature/guessing-game` (not yet merged). The player starts a run in a normal-feeling chat with a real, NAMED character (revealed — name and avatar shown just like any other chat). That character talks as itself but is instructed to naturally steer the conversation toward a *different, hidden* figure it has in mind. **There is no separate guess control** — the player types both ordinary questions and guesses into the same box, and the server itself classifies which is which on every turn (see `pages/api/game/message.ts`); when it's genuinely unclear, the character asks the player to confirm what they mean, in character, rather than guessing on their behalf. One wrong guess per hidden target is tolerated; a second ends the run, or the player can voluntarily give up anytime — either via the hamburger menu's "Give Up" button, or by typing it straight into the chat box ("I give up", "just tell me") — and always be told the answer (see `pages/api/game/give-up.ts` below). A correct guess reveals the hidden figure and holds on a "Continue" prompt (see the round-switch bullet below) before **that revealed figure becomes the player's new chat partner** — greeting them and, in turn, steering toward a fresh hidden target — continuing the chain and building a streak. TTS audio is generated for every reply, same as ordinary chat. Phase 1 (guest-playable core loop, this section) is functionally built, manually verified in dev, and has automated test coverage — Phase 2 (a public, opt-in cross-user leaderboard) hasn't been started.

Getting the "who's hidden" direction backwards here is an easy mistake (an earlier internal draft of this feature had the *current* character hiding its own identity instead, and a separate draft had a dedicated guess-only input box) — the character you're chatting with is never the mystery; the person they're describing is; and guessing happens in the same box as everything else.

- **Round state lives in a signed, encrypted, opaque token — not a DB row.** `src/utils/gameToken.ts`'s `GameStatePayload` carries both `currentCharacterName` (revealed, safe to show) and `nextCharacterName` (the hidden guess target), plus `currentCharacterName`'s generated persona prompt, avatar/gender/voiceConfig, the streak, the current wrong-guess count, and every name already met this streak (`usedNames`, to avoid repeats). `signGameState`/`verifyGameState` encrypt all of it into a single AES-256-GCM token the client holds (in localStorage) and echoes back on every `/api/game/*` call. This is deliberate, not a shortcut: `nextCharacterName` must never be readable by the client (guest or signed-in), and this app's dominant pattern is "guest is fully client-authoritative, the database is a bonus, never a requirement" (see "Account persistence" below) — a DB-backed session table would be the first piece of core gameplay to require a database.
- **Key derivation never falls back to a per-process random key.** `getKey()` derives the AES key from `GAME_TOKEN_SECRET ?? NEXTAUTH_SECRET ?? API_SECRET` — since `API_SECRET` is already a required env var in this app, this needs zero new required configuration and stays stable across every concurrent Vercel serverless instance. Only a deliberate secret rotation ever invalidates an in-flight token, degrading to a friendly "please start a new game" 400, never a crash.
- **`verifyGameState()` fails CLOSED — the one deliberate exception to this codebase's usual fail-open convention** (an avatar-cache miss regenerates; a personality-generation error falls back to a generic template). Any tamper, malformed input, or decrypt failure returns `null`, and `pages/api/game/message.ts` treats that as a hard 400, never as a partially-trusted state.
- **The character-generation, avatar, and voice pipelines are shared with ordinary bot creation, not duplicated.** `src/utils/pickRandomCharacterName.ts` (extracted from `pages/api/random-character.ts`), `src/utils/avatarGeneration.ts`'s `getOrGenerateAvatar` (extracted from `pages/api/generate-avatar.ts`), and `src/utils/characterVoices.ts`'s existing `getVoiceConfigForCharacter` are all called in-process by the game's routes instead of over HTTP. An avatar/voice is only ever resolved for `currentCharacterName` (the one actually shown) — never for the still-hidden `nextCharacterName` — so there's no accidental spoiler.
- **`src/utils/gameRound.ts`'s `generateGameRound(currentCharacterName, excludeNames)`** is the one place the persona → avatar → opening reply → voice → TTS sequence lives, shared by `pages/api/game/start.ts` (a run's first round) and `pages/api/game/message.ts`'s round-advance on a correct guess — those two call sites used to each carry their own copy of this exact 5-call sequence before being consolidated here.
- **`src/config/serverConfig.ts`'s `generateGameCluePersonaPrompt(currentCharacterName, nextCharacterName)`** builds the persona the player actually talks to, reusing `generatePersonalityPrompt` for `currentCharacterName`'s own voice and appending a rules block: steer toward `nextCharacterName` without naming them; escalate hint specificity only as the conversation goes on (a well-read player should need real inference across several exchanges, not a lucky first guess — an internal prompt-tuning yardstick, never shown in the app); never claim not to know or refuse to discuss `nextCharacterName` for being from a "different time/place/story" than `currentCharacterName` (the pool spans wildly different eras/cultures/fictional universes, and this would break immersion); and — the subtle part — a vague, atmospheric hint that *someone* is on its mind is required starting with its very first greeting (otherwise the player has no way to know there's anyone to guess at all), but anything CONCRETE or identifying is gated behind the player actually asking.
- **`src/utils/gameReply.ts`** holds the three Claude-call shapes the game needs: `getGameReply` (ordinary in-character turn, takes an optional `extraInstruction` used to ask for confirmation when a guess is ambiguous), `getOpeningReply` (a round's greeting, wrapping `getGameReply` with a never-throws fallback), and `getGuessReactionReply` (the one-turn override that lets the persona confirm/deny/reveal once `pages/api/game/message.ts` has already judged a guess — also never throws, falling back to a templated reaction). This never-throws guarantee matters most on a correct guess: the player already succeeded, so a transient Claude hiccup generating the *next* character's greeting must never turn that success into a 500.
- **`pages/api/game/start.ts`** picks both names, generates the persona + avatar + voice, and returns the opening greeting (with audio) plus the signed token and `currentCharacterName` (safe to reveal). **`pages/api/game/message.ts` handles every ordinary turn, guess, and give-up request** — there is no separate `/api/game/guess`. Every call: verifies the token, classifies the message (`"clear"` guess / `"ambiguous"` / `"giveUp"` / `"none"`, via a dedicated Haiku classifier that also judges correctness in the same call when `"clear"`), then either replies normally, asks for confirmation (`"ambiguous"`), signals a give-up request (`"giveUp"`, see below), or runs the guess outcome (promote-and-advance on correct, tolerate-once then reveal-and-end on wrong) — see its own doc comment for the exact response shape. **`pages/api/game/give-up.ts`** is the third and final game endpoint: a voluntary end-the-run action, gated behind an in-app confirmation step client-side (`GamePage.tsx`'s give-up dialog). It does no Claude call or avatar/voice work at all — the hidden `nextCharacterName` is already inside the verified token, so it just decodes it and returns `{ revealedName, finalStreak, gameOver: true }`, the same shape the client already renders for a two-wrong-guess game over.
- **Giving up via chat reuses the exact same confirmation dialog as the menu button, rather than ending the run unconfirmed.** When `classifyGuess` returns `"giveUp"`, `message.ts` skips generating any in-character reply and returns `{ giveUpRequested: true }` alone. `useGameController.ts`'s `sendMessage` sets a `giveUpRequested` flag (the player's own typed message still appears in the transcript; no bot reply is appended for that turn); `GamePage.tsx` watches it and opens its existing give-up confirmation modal — the same one the hamburger menu's "Give Up" button opens — so a stray "I have no idea" phrased as a give-up still requires an explicit confirm before the run actually ends. Only on confirmation does the client call `/api/game/give-up` as usual.
- **The guess classifier's `"clear"` vs `"ambiguous"` bar was tuned after a real dev-session bug.** Decoded session logs (via the `/api/audio?...&text=` query param, which carries the full reply verbatim) once showed a player correctly narrow a round to "England," then guess "Edward" (the real hidden answer was a different, similarly-named king, "Edmund Ironside") repeatedly across eight straight turns, with the character only ever demanding "the full name" and never letting the guess resolve to a scored outcome — `game_guess_correct`/`game_over` never fired once in that session. `classifyGuess` (`pages/api/game/message.ts`) now explicitly treats a single specific candidate name as `"clear"` rather than bouncing it to `"ambiguous"`, and `AMBIGUOUS_GUESS_NOTE` (`src/utils/gameReply.ts`) asks for confirmation once rather than repeatedly. If this regresses, check real session logs the same way rather than relying on a short manual playtest — the failure mode only showed up after many turns.
- **The guess classifier's `"correct"` judgment was over-corrected too far toward lenient after the Edward/Edmund fix above, and needed its own separate tightening.** Found live on a Preview deployment: hidden character was "Laertes" (Hamlet's foil, Polonius's son), the player guessed "Hamlet" — a different character in the same play — and the classifier scored it as `correct: true`, ending the round on a wrong answer. The `"clear"` vs `"ambiguous"` leniency from the Edward/Edmund fix (accept a single confident candidate name rather than demanding an exact/full name) had bled into correctness itself: the prompt's original "accept ... unambiguous descriptions, not just an exact name match" reads as license to accept a *related* name, not just an *equivalent* one. `classifyGuess`'s system prompt now explicitly separates the two: still lenient on how a correct guess may be phrased (nicknames/aliases/translations/epithets of the *same* individual), but strict on identity — two different people/characters are never a match merely for being closely related (family, rivals, foils, or others from the same story/play/myth/event), with "Hamlet" vs "Laertes" as the prompt's own worked counter-example. If this regresses, it'll look like the opposite failure mode from Edward/Edmund: a real wrong guess getting scored as a win rather than a real right guess getting bounced to ambiguous forever — check for that shape specifically before re-loosening this prompt.
- **The "how to play" rules are a real, explicit UI surface, not something inferred by playing.** `GameInstructionsModal.tsx` shows automatically the first time a player reaches `/game` (gated by `chatbot-game-instructions-seen`), and is always reachable again from the game page's menu. Its copy is the accuracy-critical spot for this feature — it must describe the actual mechanic (guesses typed into the same chat box, no separate guess control) rather than an earlier, abandoned draft's design.
- **Client side reuses the main chat UI, not a lookalike.** `app/components/ChatShell.tsx` is the chat screen shell extracted out of `ChatPage.tsx` (header with clickable avatar + portrait lightbox, scrollable transcript, `ChatInput` with full audio controls, `ChatStatus`) — both `ChatPage.tsx` and `GamePage.tsx` render through it now, each supplying its own menu items/modals/banners via its slots, so the game *is* the same chat UI, not a copy that can visually drift. `app/components/useGameController.ts` mirrors `useChatController.ts`'s shape (message/loading/error state, scroll/focus via the same `useChatScrollAndFocus`, audio via the same `useAudioPlayer` plus a shared `app/components/useAudioEnabled.ts` — extracted because both hooks had grown near-identical copies of the mute-toggle-and-persist logic). "Back to Home" in the menu ends the run (`quitGame()`) rather than leaving a stale token behind; there's no separate "Quit" control.
- **A correct guess holds on a "Continue" prompt before switching partners, rather than advancing instantly.** `pages/api/game/message.ts`'s correct-guess response already carries everything needed for the round switch (the new `currentCharacterName`, `nextReply` greeting, `gameToken`, avatar/gender/streak) in one call, but `useGameController.ts`'s `sendMessage` holds that data in a `pendingAdvance` object instead of applying it immediately — only the previous character's reaction message and the "correct" event are shown right away. `GamePage.tsx`'s banner renders a "Continue" button (`awaitingContinue`) instead of the old passive "Say hello to your next conversation partner" text, and the chat input is disabled (`apiAvailable={!awaitingContinue}`) until it's clicked. Clicking it calls `continueRound()`, which appends the new partner's greeting and applies the held-back state. This gives the player a deliberate beat to register the win before the identity/avatar/streak actually switches, rather than the reveal and the next round's greeting arriving in the same instant.
- **`roundStartIndex` must be computed from the full `messages` array length, not from the current round's slice length — a real bug found and fixed after Phase 1 was first called "functionally complete."** `sendMessage` computes `historyForServer = messages.slice(roundStartIndex)` (the current round's own transcript) before appending the new turn. The bug: the post-correct-guess update used to set the *next* `roundStartIndex` to `historyForServer.length + 2` — a length relative to the current round's slice, not an absolute index into the full array. This only coincidentally produced the right value on the very first round switch (round 1 → 2, since `roundStartIndex` starts at 0, where "relative" and "absolute" are the same number) — from round 2 onward it silently leaked the prior round's own trailing Q&A/guess/reaction into the next round's `conversationHistory` sent to the server. Fixed by capturing `oldMessagesLength = messages.length` at the top of `sendMessage` and using `oldMessagesLength + 2` instead. `tests/app/components/useGameController.test.ts`'s "excludes prior rounds' trailing messages" test plays through three consecutive round switches specifically to catch this — a two-round test can't distinguish the fix from the bug it fixes.
- **The start/round-advance loading state is a client-side simulated stage sequence, not real server progress.** `pages/api/game/start.ts` (and `message.ts`'s round-advance) still does persona+avatar+voice+reply as one monolithic call with no client-visible stage boundary — `useGameController.ts`'s `startGame` instead cycles `startProgressMessage` through `["Creating personality…", "Generating portrait…", "Selecting voice…", "Preparing greeting…"]` on a timer while the request is in flight, for visual consistency with bot creation's staged spinner. It advances through the stages once and then **holds on the last one** rather than wrapping back to the first — a real request can easily take longer than one pass through all four (avatar generation alone can take several seconds), and wrapping around reads as the request having silently restarted rather than still being in flight. This was an actual bug found live in dev (see `tests/app/components/useGameController.test.ts`'s "holds on the last stage" regression test).
- **A stalled free/anonymous avatar provider used to be able to hang a round-start forever.** `src/utils/pollinationsImageGen.ts` and `src/utils/cloudflareImageGen.ts`'s `fetch()` calls now pass `signal: AbortSignal.timeout(25000)` — plain `fetch()` has no default timeout, and Pollinations in particular (anonymous, unauthenticated, no daily-cap protection) can occasionally stall past any reasonable wait. Before this fix, a stalled provider meant `getOrGenerateAvatar` never settled at all, so `generateGameRound`'s `await` — and the whole `/api/game/start` or round-advance request — hung indefinitely rather than the try/catch around it ever getting a chance to degrade gracefully. This applies to ordinary bot creation's avatar generation too, not just the game.
- **Rate limits:** `game-start` (10/min/IP — sized for the combined personality+avatar generation cost, since calling those pipelines in-process means this limiter is the only ceiling on that cost), `game-message` (10/min/IP, same tier as `chat`), `game-give-up` (10/min/IP).
- **Phasing:** Phase 1 (this section) — functionally complete, manually verified, automated test coverage in place. Phase 2 (not started): a `game_results` table plus `users.showOnLeaderboard` backing a public `/leaderboard` page of best streaks. Phase 3 (deferred): `analyticsEvents` instrumentation, SSE streaming.
- **Not yet done:**
  1. Phase 2's leaderboard (see "Phasing" above) hasn't been started at all — no schema changes, no `/leaderboard` page.
  2. Run the full `npm run ci` gate before merging and fix whatever it surfaces.
- **Not mechanically verifiable regardless:** whether a given real-world guess is judged fairly, and whether clue difficulty/pacing actually holds up in real conversations, are ongoing manual-QA/prompt-iteration concerns.

### Account persistence (in progress)

The app is migrating toward optional user accounts with server-persisted bots/chat history, staged as additive phases — guest (no account) usage must keep working unchanged throughout.

- **Phase 1 (done):** `pages/api/generate-avatar.ts` uploads generated avatars to Vercel Blob and returns a durable URL when `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` is configured; otherwise falls back to a base64 data URL (unchanged prior behavior).
- **Phase 2 (done):** Auth.js (`next-auth@4` — stable; v5/"Auth.js" is still beta and its simplified `auth()` helper is App-Router-only, which doesn't fit this repo's Pages-Router-authoritative API convention) with Google sign-in, JWT sessions (no `sessions` table). `src/auth/authOptions.ts` holds the config; `pages/api/auth/[...nextauth].ts` mounts it — this route intentionally lives in `pages/api` (unlike `/reference`) since Auth.js v4's Pages Router integration is a direct default-export handler, not an App Router route handler. `src/db/schema.ts` (Drizzle, Postgres via Neon) defines just `users`/`accounts` so far. `src/db/client.ts` exports `getDb()`, a lazily-constructed singleton — it must never connect at module import time, since `next build` bundles (but never executes) API route handlers, and constructing eagerly would break the build whenever `DATABASE_URL` is unset. The Drizzle adapter in `authOptions.ts` is likewise only attached when `DATABASE_URL` is set — same degrade-gracefully shape as the Blob token and the Upstash rate-limit store. Use `src/utils/getSessionUserId.ts` in any future Pages Router handler that needs to know the signed-in user — never trust a client-supplied user id, same trust boundary `proxy.ts` enforces for request origin. Schema changes are applied locally via `npm run db:push` (Drizzle Kit, not part of `npm run ci` since it mutates external state). `proxy.ts` bypasses its origin/API-key check entirely for `/api/auth/*` — Auth.js's own signed CSRF/state cookies secure those routes, and Google's OAuth callback arrives with Google's own Referer, which the origin check would otherwise reject. `next.config.mjs`'s CSP `form-action` explicitly allows Google's consent-screen origin (`https://accounts.google.com`), since Chrome enforces `form-action` against a form submission's eventual redirect target, not just its immediate action URL — without it, the sign-in form's redirect to Google is silently blocked with no visible error; extend this list for any future OAuth provider. Real Google sign-in only works on the static production domain: Google's redirect URI matching has no wildcard support, so it can't follow Vercel preview deployments' per-push URLs. Preview (`VERCEL_ENV === "preview"`) swaps Google out entirely for a stub `Credentials` provider (`id: "preview-stub"`, in `authOptions.ts`) that issues an ephemeral, unverified, non-DB-backed session from just an email string — good enough to exercise signed-in UI on a preview deployment. Swapped, not added alongside: Google has no client_id configured on preview and would just fail with `SIGNIN_OAUTH_ERROR` if offered there too. Guarded twice (excluded from the `providers` array outside preview, and rechecked inside `authorize()` itself) so it can never activate outside an actual Vercel preview build.
  - **Facebook sign-in (issue #832): built, shipped, then fully removed.** Meta's Publish flow gates any app off Development mode behind Meta Business Portfolio verification, regardless of which login product it registers — in practice this demands formal business documents (EIN letter, business registration, articles of incorporation, etc.) an individual developer without a registered business doesn't have. Without completing that, Facebook sign-in could only ever admit Facebook's own added testers, never the public. Removed rather than left dark behind a flag — see `authOptions.ts`'s doc comment and this file's git history for the exact prior shape if it's ever worth revisiting (e.g. after completing EIN-based verification).
- **Phase 3a (done):** Landing-page sign-in via `AuthControl` (`app/components/AuthControl.tsx`) — the chat header intentionally has no sign-in control; a guest mid-chat goes back to the landing page to sign in. Clicking "Sign in" opens an in-page lightbox (`SignInModal`) with a "Continue with Google" button, rather than redirecting straight off-site with zero context, or (Auth.js's own default for 2+ providers) a bare picker page. On the preview-stub provider, that step is skipped and it signs in immediately with no lightbox, since it's a smoke-test aid, not a real login. `SessionProvider` lives in its own `"use client"` wrapper (`app/components/Providers.tsx`) rather than being rendered inline from the Server Component root layout (`app/layout.tsx`) — inline breaks `next build`'s static prerender of `/`. Google sets `allowDangerousEmailAccountLinking: true` (a deliberate, documented next-auth v4 opt-in, not a default) — see `authOptions.ts`'s doc comment for the trust reasoning before extending this to any future provider.
- **Phase 3b (done):** `bots` table (`src/db/schema.ts`) persists a signed-in user's created characters; `pages/api/bots.ts` exposes `POST` (upsert on create) and `GET` (list, most-recently-updated first), both gated on `getSessionUserId` and silently no-op (200, empty result) for guests or when `DATABASE_URL` isn't configured — never a 401, since accounts are additive. Wired into `app/index.tsx`'s `handleBotCreated`: fire-and-forget, `.catch()`-swallowed, so a persistence failure never breaks bot creation for a signed-in user (identical to how it already works for guests).
  - **Environment scoping, not separate databases:** one shared Neon database serves local dev, Preview, and Production — rows are walled off by an `environment` column (`bots.environment`, part of its `(user_id, name, environment)` unique constraint) rather than provisioning a Neon branch per environment. `src/utils/environment.ts`'s `getCurrentEnvironment()` resolves it from `VERCEL_ENV` (`"production"` | `"preview"`, set by Vercel itself, never client-controlled), falling back to `"development"` when unset (plain local `next dev`). Every `bots` query must filter on this — see `pages/api/bots.ts` for the pattern. Deliberately *not* applied to `users`/`accounts` (a signed-in identity is the same person regardless of which environment they're using) or `avatar_cache` (see below — intentionally global).
  - **`avatar_cache` (global, not environment-scoped):** `pages/api/generate-avatar.ts` checks this table (keyed by lowercased character name) before calling Claude + an image provider, and writes to it after a successful generation — even a free image provider isn't instant, so a name generated once is reused by every user, guest or signed-in, in every environment, going forward. This is a deliberate exception to environment-scoping: walling it off would reintroduce the cost problem it exists to solve. Only real generations are cached, never the `/silhouette.svg` fallback — caching a failure would permanently deny a name a real portrait past a transient outage. `gender` is cached alongside the image since it's produced by the same Claude prompt-generation step a cache hit skips entirely, and callers need it for voice selection. Cache reads/writes degrade gracefully (return null / no-op) with no `DATABASE_URL` or on any DB error — never fail the actual generation request.
  - **Resuming a saved character:** `ResumeBotDropdown` (`app/components/ResumeBotDropdown.tsx`) renders on the landing page, above the sign-in row, only for a signed-in user with at least one persisted character; each option is labeled with a friendly relative last-updated time (`formatRelativeTime` — "a few minutes ago", "yesterday", etc.). Selecting one calls the exact same `onBotCreated` callback `BotCreator` uses for a newly-created character, so there's no separate "load an existing bot" path to keep in sync. Only identity (name/personality/avatar/voice) is restored synchronously this way — chat history catches up separately via phase 3c below.
- **Phase 3c (done): `messages` table + server-persisted chat history.** For a signed-in user's saved character, `pages/api/chat.ts` becomes the source of truth for personality and message history instead of trusting the client's `personality`/`conversationHistory` on every request — same rationale as bot ownership in phase 3b. It looks up the caller's `bots` row by `(user_id, name, environment)` (the same unique index `pages/api/bots.ts` relies on); a guest, no `DATABASE_URL`, or a character never saved server-side (e.g. a copyright-warning override, which is never persisted at all — see the copyright-validation section above) all fall through to the exact prior client-authoritative behavior, unchanged.
  - **Rolling summarization checkpoint:** `bots.summary`/`summarizedThroughMessageId` (`src/db/schema.ts`) replace re-summarizing the full history from scratch every turn once it exceeds 20 messages. Each turn fetches only the `messages` rows after the checkpoint; if that unsummarized tail exceeds 20, the oldest excess is folded into a new summary via `summarizeConversation`'s new optional `priorSummary` param (`src/utils/conversationSummarizer.ts`) — which compounds the existing summary rather than discarding it — and the checkpoint advances to the last message folded in. Most turns touch the summarizer zero times, reusing the existing summary for free. Notably, the *client* already pre-trims `conversationHistory` to the last 20 messages before sending (`useChatController.ts`), so the original client-history-based summarization branch never actually fired in production — this DB-backed path is what makes summarization real.
  - **Write path:** after every response path (cache hit, streaming, non-streaming) sends its reply, `finalizeChatPersistence` fire-and-forget-inserts the user/bot message pair into `messages` and, if this turn advanced the checkpoint, updates `bots.summary`/`summarizedThroughMessageId` — best-effort, same resilience pattern as TTS and the avatar cache; a write failure is logged and never discards an already-generated reply. The intro message ("Introduce yourself...") goes through this same `/api/chat` path, so it's persisted with no special-casing.
  - **Read path:** `GET /api/messages?botName=<name>` (new, GET-only — messages are never written through a directly-callable endpoint) returns a signed-in user's chat history for one saved character, oldest-first, capped at 200. `useChatController.ts` seeds its `messages` state from local storage instantly on mount (unchanged, so perceived load time doesn't regress), then — only when signed in — fetches this endpoint in the background and adopts the server's list only if it's *longer* than what's already loaded (the new-device / cleared-storage case). Local storage stays the fast per-device cache; the server is the durable, multi-device source of truth.
  - Schema changes for this phase were applied via `npm run db:push` same as prior phases — remember to run it again after pulling `src/db/schema.ts` changes, since a mismatched live DB fails every `bots`/`messages` query with a missing-column/relation error (caught and logged, degrades to guest-like behavior — silent, easy to miss without checking server logs).
  - **This exact failure mode (edit `schema.ts`, forget `db:push`) broke live dev/prod twice** — once for `users.preferred_name`, once for `avatar_cache.display_name` — before `scripts/check-db-schema.cjs` (`npm run db:check`) existed. It's a read-only guardrail: it regex-scans `schema.ts` for declared columns, compares them against `information_schema.columns` for the same tables in the real database, and fails loudly (non-zero exit) if `schema.ts` has a column the live DB doesn't. Wired into both `predev` (so it surfaces the moment you start `next dev` locally) and `npm run ci` (so it's part of the gate before calling work done) — it silently no-ops without `DATABASE_URL`, which is also why it's a no-op on GitHub Actions CI specifically (no DB credentials there); it only has teeth against a real `DATABASE_URL`, i.e. local dev. It never runs `db:push` itself or writes anything — closing the gap this way, rather than trying to auto-apply schema changes, keeps `db:push` an explicit, reviewed action against a shared production database.
- **Tracking:** [GitHub issue #830](https://github.com/andylacroce/character-chatbot-generator/issues/830) covers the whole migration across all phases. Keep it current as work lands — check off a phase's checkbox in the issue body (`gh issue edit 830 --body-file <file>`) and post a short progress comment (`gh issue comment 830 --body "..."`) when a phase completes or a significant sub-step is verified working, not just at the very end.

### Personalized greeting (the visitor's own name)

Independent of the account-persistence migration above: the app also tracks the *human's*
own preferred name (what a character should call them), not just the character's.
`users.preferredName` (`src/db/schema.ts`) is deliberately separate from Auth.js's own
`users.name` (populated from the OAuth profile, used only for `AuthControl.tsx`'s "Sign
out (X)" label) — this one is explicit, user-typed, and never inferred from a sign-in
provider.

- **Capture point: a one-time gate, not a standing field.** `useBotCreation.ts`'s
  `handleCreate()` pauses itself (`showNameGateModal`) the first time a browser submits a
  character with no name known yet (`userNameCtx.isResolved && !name && !hasSkippedGate`),
  showing `NameCaptureModal` (`mode="gate"`) — "Continue" saves the typed name and resumes
  generation, "Skip for now" marks `chatbot-user-name-gate-skipped` (so it never asks again
  in that browser) and resumes anyway. This single insertion point covers every path that
  calls `handleCreate()` (the form, the validation/description-modal continuations, the
  `?name=` URL auto-launch effect) for free. Two earlier placements — a masthead icon, then
  a field stacked above the character-name input — both tested badly (missed, or cluttered
  the primary flow) before landing on this contextual gate.
- **Editable anytime via the account menu, not just at creation.** `useAccountMenu.tsx`'s
  "Add your name" / "Change your name" item opens the same `NameCaptureModal` in
  `mode="edit"` — see "Unified header" below for where that menu appears.
- **Guest:** stored client-side only, in localStorage under `STORAGE_KEYS.userName`
  (`chatbot-user-name`) and `STORAGE_KEYS.userNameGateSkipped` (`chatbot-user-name-gate-skipped`
  — see `src/utils/storageKeys.ts`). `useChatController.ts` reads the name directly and sends
  it as `userName` on every `/api/chat` request.
- **Signed in:** `pages/api/user-profile.ts` (`GET`/`POST`, same guest/no-`DATABASE_URL`
  200-no-op shape as `pages/api/bots.ts`) persists it to `users.preferredName`.
  `useUserName.ts` seeds the DB once from any pre-existing guest-entered localStorage value
  on first sign-in, so switching from guest to signed-in doesn't require retyping it.
- **Server precedence (`pages/api/chat.ts`):** for a signed-in user, the DB value wins once
  one is set — same server-authoritative-once-saved rationale as `personality` for a saved
  bot, so a later request can't spoof a different name for an account that already has one.
  Otherwise the client-supplied `userName` (sanitized via `sanitizeUserName`,
  `src/utils/security.ts` — keeps apostrophes/hyphens, unlike `sanitizeCharacterName`) is
  used. When present, it's added to the system prompt as a `<user_name>` block, following
  the same wrap-in-tags prompt-injection mitigation as `<character_persona>`/
  `<conversation_summary>`, and folded into the reply cache key — otherwise two
  differently-named users asking an identical question could get a cross-contaminated
  cached reply that greets the wrong person.
- **Shown live in the chat transcript, not just spoken by the character.** `ChatMessage.tsx`
  displays the visitor's name instead of the generic "Me" on their own messages, threaded
  down from a single `useUserName()` instance in `ChatPage.tsx` through `ChatMessagesList`/
  `VirtualizedMessagesList` — so changing it via the account menu updates every
  already-rendered message immediately, not just new ones. `downloadTranscript.ts`/
  `pages/api/transcript.ts` accept the same `userName` and use it in place of "Me" in the
  downloaded HTML transcript too.
- Optional everywhere: no name (or Skip) just means the generic "Me"/no personalized
  greeting — nothing else changes. Not part of the `messages` table — it's a per-turn
  system-prompt addition and a display-only transcript substitution, not persisted chat
  content itself.
- **Sign-in is reachable from the same flow, not a separate mechanism.** Both
  `NameCaptureModal` (when `onRequestSignIn` is passed) and `useAccountMenu`'s own
  `AuthControl` share **one** `SignInModal` instance per page (`AuthControl`'s
  `onRequestSignIn` prop skips its own internal modal in favor of the caller's). This isn't
  just tidiness: `AuthControl` used to be rendered *inside* the hamburger's dropdown and
  render its own `SignInModal` inline — since a `position: fixed` modal is still a DOM
  descendant of whatever rendered it, `HamburgerMenu.module.css`'s dropdown-item reset
  (`.menuDropdown button { border: none; background: none; ... }`) was silently stripping
  the sign-in buttons' real styling. Hoisting to one shared modal per page, rendered as a
  sibling of the header rather than inside the dropdown, fixed it structurally instead of
  patching around it.

### Unified header

`app/components/AppHeader.tsx` (renamed from `ChatHeader.tsx`) is the one header
component shared by the chat page, the game page, the landing page, and the Character
Wall — rather than each page owning its own masthead markup that has to be kept in visual
sync by hand. It's deliberately generic: `{ menuItems, menuSide?: "left" | "right", center,
extra? }` — a plain 3-bar hamburger on `menuSide`, an arbitrary `center` slot, and an
optional `extra` slot on the opposite side. Its own CSS module only carries the generic
shell/chrome (the sticky bar, the left/center/right grid) — page-specific content (avatar
buttons, brand links, menu-item icons) lives in that page's own `.module.css`, per this
repo's "no shared CSS modules" convention (a rule aimed specifically at descendant
selectors that could reach into another component's DOM — see the CSS-specificity bug
below — not a ban on sharing a genuinely atomic, single-class rule: the `.menuDivider`
separating a page's own menu items from `useAccountMenu`'s below lives once in
`app/globals.css`'s utility section and is referenced by its literal class name, not
copy-pasted per module — see `feedback_no_shared_css_modules` memory for why this was
tightened after an early draft duplicated it three times).

- **There is no separate identity-chip trigger** — every page uses the plain 3-bar icon.
  The dark-mode toggle and, for whichever page's `menuItems` includes it, a signed-in
  user's identity/name status are both folded into the hamburger's own dropdown
  (appended by `AppHeader.tsx` after each caller's `menuItems`) instead of separate header
  controls. This replaced an earlier design with a dedicated `menuTrigger`/identity-chip
  prop — consolidated so a mobile header didn't have to fit a name, an avatar, a toggle,
  and a chip all in ~390px at once.
- **`useAccountMenu.tsx`** is the shared "account" bundle every page's header now uses —
  `BotCreator.tsx` (landing page), `CharsGallery.tsx` (`/chars`), `ChatPage.tsx`, and
  `GamePage.tsx` all call it and append its `menuItems` after their own page-specific
  items (a `menuDivider` separates the two groups). It returns `{ userNameCtx, menuItems,
  modals, requestSignIn }`: `menuItems` leads with a non-interactive identity label
  ("Guest" or the visitor's name/email), then the change-name button, an "Admin Stats"
  link (`FaUserShield` icon) when a cheap client-visible check
  (`GET /api/admin/is-admin` — see "Internal analytics" below) reports the signed-in
  caller is an admin, then `<AuthControl onRequestSignIn={requestSignIn}>`. `modals`
  renders exactly one shared `NameCaptureModal` (`mode="edit"`) and one shared
  `SignInModal` per page — a DRY consolidation extracted after per-page inline copies of
  this logic started drifting apart (see "Personalized greeting" above).
  `BotCreator.tsx`/`CharsGallery.tsx` use it as their *entire* menu (no other items of
  their own); `ChatPage.tsx`/`GamePage.tsx` put it after their existing page-specific
  items (Back to Character Creator/Download Transcript/Character Wall, and Back to
  Home/Give Up/How to Play, respectively) — chat and the game no longer keep sign-in out
  of their headers, a deliberate reversal of an earlier "no sign-in control in the chat
  header" decision (see git history around 2026-09-17 if that decision's original
  rationale is ever worth revisiting).
- **`BotCreator.tsx`**'s `center` slot is `LandingCharacterCarousel` (below);
  `CharsGallery.tsx`'s is a `BackHomeLink` pill button (`app/components/BackHomeLink.tsx`
  — a house glyph + "Back to Home", styled like an outlined pill, the one consistent
  look for this action outside a dropdown; also used by the guessing game's start
  screen, see "Guessing game" below); `ChatPage.tsx`/`GamePage.tsx` (via the shared
  `ChatShell.tsx`) use `menuSide="left"` with the character's avatar + name as `center`
  and a personal brand link as `extra`.
- **Signing in and signing out both always redirect to `/`** (every `signIn(...)` call in
  `AuthControl.tsx`/`SignInModal.tsx`, and `AuthControl.tsx`'s `signOut(...)`, pass
  `callbackUrl: "/"`) regardless of which page triggered them — now that sign-in/out are
  reachable from the chat and game headers too, NextAuth's own default (redirect back to
  the current URL) would otherwise drop a visitor back into the middle of a chat/game
  session either way. `callbackUrl` alone isn't sufficient, though: `app/index.tsx`'s
  `Home` renders `ChatPage` instead of the landing page whenever a bot session is still
  in localStorage, regardless of navigation intent, so landing on `/` would otherwise
  still show whatever chat was already open. `clearStoredBot()`
  (`src/utils/getValidBotFromStorage.ts`) — the same cleanup `handleBackToCharacterCreation`
  already does — is called immediately before the Google/preview-stub `signIn()` and
  `signOut()` calls (not the magic-link one, which doesn't navigate immediately) so `/`
  reliably renders the actual landing page afterward.
- **`LandingCharacterCarousel.tsx`** is the landing page's `center` slot: a small
  auto-advancing rotation through recognized characters, reusing the exact same data
  `CharsGallery`/`pages/api/chars.ts` already serves (`GET /api/chars?limit=100`), shuffled
  client-side (Fisher-Yates) so the same 20-character rotation doesn't show in the same
  order on every load. Auto-advances every 4s, pauses on hover/focus; clicking a portrait
  navigates via `/?name=<encoded name>` — the exact same launch point the Character Wall's
  own lightbox uses (see "Character Wall" above), so it resolves resume-vs-fresh-create
  identically. Portrait and name-label sizes are fixed (not content-sized) specifically to
  prevent header layout shift as the carousel advances through names of very different
  lengths — an earlier version let a long name reflow the header's height on every tick.
- **A CSS specificity bug worth knowing about if the header ever shifts layout again:**
  `AppHeader.module.css` originally had a generic `.headerCenter > button { display: block;
  }` rule (specificity 0,1,1) meant for the chat page's avatar button. Because the
  carousel's own root element is also a `<button>` directly inside `.headerCenter`, that
  rule silently beat the carousel's own `.carousel { display: flex; }` (specificity 0,1,0)
  and collapsed it to block layout, which is what caused the shift. Fixed by deleting the
  generic rule from `AppHeader.module.css` and adding `display: block` directly to the
  specific `.avatarButton` class in `ChatPage.module.css` where it actually belongs —
  a reminder that a broad selector living in a *shared* CSS module can reach into and break
  a completely different component that happens to share the same DOM shape.

### Internal analytics (`/admin`)

Vercel Analytics/Speed Insights (`app/layout.tsx`) cover page views and performance; this is the *product*-usage layer on top, deliberately kept small rather than reaching for a third-party analytics service — this app is a single hobby-scale Vercel deployment, not a multi-service system that needs Splunk/Datadog-style infra observability.

- **`analytics_events`** (`src/db/schema.ts`) is an append-only event log — `name`, `environment`-scoped like `bots`, a nullable `userId` (null = guest), and a `metadata` jsonb blob. It exists specifically because guest usage — likely most traffic, since sign-in isn't required — never touches `bots`/`messages` at all, so without this table most real usage is invisible. `src/utils/analytics.ts`'s `recordEvent()` writes to it fire-and-forget, no-op without `DATABASE_URL`, matching the exact resilience pattern used by the avatar cache and bot-persistence writes elsewhere.
- **Only 3 low-frequency, high-signal events are instrumented:** `character_validated` (`pages/api/validate-character.ts`, success path only — the fail-open branch isn't a real classification and would corrupt the signal), `avatar_generated` (`pages/api/generate-avatar.ts`, tagging which provider actually served the image: `cache` | `cloudflare` | `pollinations` | `none`), and `bot_created` (`pages/api/generate-personality.ts`). Deliberately **not** instrumented: anything that scales with chat-message volume (guest traffic could be large; `messages` already covers signed-in volume) and TTS synthesis (lower-signal). None of the three ever record character names or other user-supplied text — this is a small internal usage log, not a place to accumulate user content, and doing so would also undermine `skipPersistence`'s guarantee that a copyright-override character leaves no durable trace.
- **`/admin`** (`app/admin/page.tsx` + `GET /api/admin/stats`) is an unlinked-but-reachable internal stats view (same reachability model as `/reference`'s API docs) showing aggregate counts — no per-user or per-guest detail. Gated by `src/utils/isAdmin.ts`: a signed-in session whose email is in the optional `ADMIN_EMAILS` env var (comma-separated). **Fails closed** — no `ADMIN_EMAILS` configured means nobody is admin, the opposite default of every other optional feature in this app, because this one grants read access to aggregate activity rather than a convenience for the caller's own data. The page itself 404s a non-admin visitor (`notFound()`, via `isAdminSession()`) rather than rendering the stats shell and then showing a "not authorized" message. It shares the same `AppHeader`/`useAccountMenu` chrome as every other page rather than a bespoke masthead.
- **`/admin/moderation`** (`app/admin/moderation/`) is the character allowlist/blocklist/warning-log admin panel — see "Copyright/trademark validation" above for what it manages. Same server-side gating shape as `/admin` (`notFound()` via `isAdminSession()` in `app/admin/moderation/page.tsx`).
- **Discoverable via the account menu, not just a memorized URL.** `pages/api/admin/is-admin.ts` is a cheap, DB-free `GET` wrapping the same `isAdmin()` check both pages enforce — it always returns `200 { isAdmin: boolean }` (never 401/403, since it isn't itself a security boundary, just a display decision) and is rate-limited 30/min. `useAccountMenu.tsx` (see "Unified header" above) calls it only while `useSession()` reports `"authenticated"`, and shows an "Admin" sub-section (its own divider + label) with "Stats" (`FaUserShield` icon) and "Moderation" (`FaBan` icon) links only when it reports `true` — styled identically to the menu's other items, including no underline, matched via `HamburgerMenu.module.css`'s generic `.menuDropdown a` reset. Both pages and their APIs still enforce their own access control regardless of whether these links are ever rendered.
- **Never honored on a Vercel Preview deployment, regardless of email match.** Preview swaps Google sign-in for a stub `Credentials` provider that issues a session for *any typed-in email with zero verification* (see "Account persistence" phase 2 above) — without this exclusion, anyone who knows or guesses the admin's email could self-assign it on a preview URL and pass the `ADMIN_EMAILS` check. `isAdmin()` checks `process.env.VERCEL_ENV === "preview"` first and refuses admin status outright before ever consulting the email list. Google OAuth can't succeed on preview anyway (no wildcard redirect URI), so this only excludes the one sign-in path that was never trustworthy.
- The API route itself also enforces standard access control independent of the page: 401 with no session, 403 signed in but not listed, both before any DB query runs. The page's own `useSession()` check is UX only (avoid a loading flash); nothing sensitive is ever server-rendered into the page shell for a non-admin.

### API documentation

Every `pages/api/*.ts` handler carries a `@swagger` JSDoc block (OpenAPI 3.0). `npm run docs:api` (`scripts/generate-openapi.cjs`, via `swagger-jsdoc`) reads those comments and writes `public/openapi.json` — a gitignored, build-time artifact, not something to hand-edit or commit. It runs automatically before `dev`/`build`/`vercel-build`; run it directly after touching a route's annotations. `app/reference/route.ts` serves the interactive UI (`@scalar/nextjs-api-reference`) at `/reference`, reading that same static file — deliberately not scanning route source at request time, since Vercel's serverless bundler doesn't reliably ship raw `.ts` alongside compiled output. The route lives outside `pages/api`, so it isn't subject to `proxy.ts` auth. `swagger-jsdoc`'s glob resolution doesn't match backslash-separated paths, so the script normalizes to forward slashes before passing them in — same class of Windows/POSIX path bug as elsewhere in this repo; keep that in mind if `docs:api` starts reporting 0 documented paths locally. The glob is recursive (`pages/api/**/*.ts`) specifically so a nested route directory like `pages/api/admin/` is still picked up — a route added under a new subdirectory without a matching glob update would silently document 0 paths for it instead of erroring.

### Code documentation standard

Distinct from the inline "why" comments described in the global `~/.claude/CLAUDE.md` (default to none; only add one when the reasoning is non-obvious) — this section covers a separate layer: a one-line `/** ... */` JSDoc summary on every top-level exported function, React component, and hook, so the codebase's public API surface is discoverable on its own, independent of any single call site's context.

- **What's required:** a `/**...*/` block with a real summary sentence, placed immediately above the declaration (a blank line, or another statement, in between breaks the association and the linter won't see it). Not required: exhaustive `@param`/`@returns` prose — types and destructured names in the signature already say that; don't duplicate it. `@param`/`@returns` tags are fine to add when genuinely useful (e.g. a non-obvious return contract) but aren't mechanically enforced.
- **Where it's enforced:** `eslint.config.cjs`'s `eslint-plugin-jsdoc` block, scoped to `app/components/**/*.{ts,tsx}`, `src/**/*.ts`, and `pages/api/**/*.ts` (tests and `.d.ts` files excluded). It requires a doc block on every top-level `function`/arrow-const/hook in those directories (via `jsdoc/require-jsdoc`'s `contexts`, matched by AST position — `Program > ...` — not by export syntax, so both `export const Foo = () => {}` and the `const Foo = () => {}; export default Foo` pattern common in `app/components` are covered) and validates JSDoc syntax itself (`flat/recommended-typescript-flavor`) wherever a block already exists. Runs as part of `npm run lint`, which `npm run ci` gates on with `--max-warnings=0` — a missing or malformed doc block fails CI the same way a lint error would. `@swagger` (this repo's OpenAPI annotation, see above) and `@google-cloud` are allow-listed via `check-tag-names`' `definedTags` rather than flagged as unknown tags.
- **Where it's exported to:** `npm run docs:code` runs TypeDoc (config: `typedoc.json`) over the same three directories and writes a browsable HTML reference to `docs-generated/` — gitignored, regenerated on demand (same "build artifact, not hand-edited or committed" treatment as `public/openapi.json` above). It's also wired into `npm run ci` (and the GitHub Actions `ci.yml` workflow) as its own step: TypeDoc fails the build on a real generation error, which is a second, independent check on the same comments beyond ESLint's syntax validation. `typedoc.json`'s `blockTags` list is the full TypeDoc default plus `@swagger` — omitting `@swagger` there makes TypeDoc warn on the OpenAPI blocks even though ESLint's `check-tag-names` already allows it, since the two tools maintain separate tag allowlists.
- **Nested/inline functions are not required to carry a doc block** — the ESLint contexts intentionally match only top-level declarations, not callbacks or helpers defined inside a component/hook body. (One partial exception: `eslint-plugin-jsdoc`'s own default behavior additionally requires a doc block on any `function`-keyword declaration anywhere, including nested ones — arrow-function helpers nested inside a component/hook are unaffected.) Don't over-apply the standard by documenting every inner helper; that's exactly the "explaining what, not why" pattern the global inline-comment preference already warns against.

### Logging standards

Audited and standardized 2026-09-12 — before this, `pages/api/chat.ts` and a few newer
routes (`bots.ts`, `messages.ts`, `chars.ts`, `admin/stats.ts`, `transcript.ts`) had drifted
onto an ad-hoc `logger.info`/`logger.error` pattern (hand-formatted message strings, no
`event` field) instead of the structured convention already dominant everywhere else
(`audio.ts`, `generate-avatar.ts`, `health.ts`, `log-message.ts`, `validate-character.ts`,
`generate-personality.ts`, `random-character.ts`, and all of `app/components`). All server
routes now follow the same convention described here, and it's ESLint-enforced so it can't
silently drift again.

- **Every log line is `logEvent(level, event, message, meta)`** (`src/utils/logger.ts`),
  never a raw `logger.info`/`.warn`/`.error(string, meta)` call or a bare `console.*`. The
  `event` field is what makes logs greppable/alertable by kind rather than by matching a
  hand-formatted message string.
- **Event names are `snake_case`, prefixed by the route or domain they belong to** —
  `chat_*`, `audio_*`, `avatar_*`, `bots_*`, `messages_*`, `chars_*`, `admin_stats_*`,
  `transcript_*`, `log_api_*`, `health_*`, `rate_limit_exceeded`. One sanctioned exception:
  `auth_error`/`auth_warning` (NextAuth's own internal error/warning `code`, e.g.
  `adapter_error_getUserByAccount`, goes in `meta.code` rather than the event name — those
  codes aren't this app's to rename, and inlining them would fragment one auth-failure
  event into dozens of ad-hoc ones).
- **Level semantics:** `info` for expected lifecycle events (a reply was sent, a cache hit,
  a 400 for a routine bad request); `warn` for something recoverable or security-relevant
  worth a human's attention (a rate limit tripped, a non-admin hit `/api/admin/stats`, a
  text/audio mismatch); `error` for an actual failure — something that surfaces as a 500,
  discards work, or means a downstream call genuinely broke.
- **Wrap `meta` in `sanitizeLogMeta()`** so long strings are truncated and nested objects
  don't blow up the log line. Never log full user-authored content (a chat message, a bot
  reply, a personality prompt, a cache key built from any of those) on a routine path —
  log lengths/hashes/ids instead (see `chat.ts`'s `chat_reply_sent`/`chat_cache_hit`
  events). A short, truncated snippet is acceptable only for a rare, bounded diagnostic
  path investigating a specific bug (e.g. `audio.ts`'s `audio_text_mismatch_regen`) — not
  as a routine per-request trace.
- **Don't double-log one failure at two levels** — a single `logEvent` call per failure,
  not an `error` and a `warn`/`info` pair carrying the same information (this used to
  happen in a few places, e.g. `audio.ts`'s not-found/read-error paths; fixed as part of
  the 2026-09-12 audit). The one deliberate exception is `health.ts`: its `error`-level
  detail is gated behind `NODE_ENV !== "production"` and an unconditional lower-detail
  `info`-level event always fires alongside it — since this endpoint is hit on every chat
  session mount and external providers have transient blips, error-level (which tends to
  drive alerting) is intentionally suppressed in production while still leaving an audit
  trail. Don't "fix" that one back into a single call without re-reading why it's split.
- **Centralize cross-cutting logging instead of repeating it per route.** Rate-limit
  exceeded (429) logging lives once inside `applyRateLimit` (`src/utils/rateLimit.ts`),
  tagged with the limiter's `name` — every rate-limited route gets it for free rather than
  each call site logging its own copy.
- **Enforcement:** `eslint.config.cjs` has two rules backing this — `no-console` (scoped to
  `app/**`, `src/**`, `pages/**`, excluding `src/utils/logger.ts` itself and tests) bans
  raw `console.*`, and a `no-restricted-syntax` rule scoped to `pages/api/**/*.ts` bans
  `logger.info(`/`.warn(`/`.error(` calls specifically, so a route can't quietly regress to
  the pre-2026-09-12 ad-hoc pattern. Both run as part of `npm run lint`, which `npm run ci`
  gates on with `--max-warnings=0` — same enforcement shape as the JSDoc standard above.
- **Client-side (`app/components`) already follows this convention exclusively** — every
  hook/component logs via `logEvent`, never raw `console.*`. Keep new client code
  consistent with that rather than introducing a second style.
- **Not mechanically enforced beyond the syntax rules above.** ESLint can ban raw
  `console.*`/`logger.*` calls, but it can't know whether a *new* failure path should have
  gotten a `logEvent` call at all — that's a judgment call, same as whether this file or
  README needs updating for a given change. Review both deliberately before opening a PR
  (the PR template's checklist exists specifically for this) rather than assuming
  `npm run ci` passing means logging/docs are current — it doesn't check either.

### Module system (do not regress)

`package.json` intentionally has no `"type": "module"` — removing it previously fixed a Vercel `ERR_REQUIRE_ESM` crash where Next's CJS serverless launcher couldn't `require()` compiled API route output. `next.config.mjs` uses an explicit `.mjs` extension instead so it's still treated as ESM. Source (TS, `import`/`export`) compiles fine either way via SWC — don't re-add `"type": "module"`.

### Security posture

Hardening pass completed 2026-09-11. Kept deliberately high-level (this file is public) —
it records *what* changed and *why*, not exploit-level specifics about anything not yet
fully closed.

- `proxy.ts`'s Origin/Referer check is CSRF protection (stops a malicious site's
  browser-side JS from riding a visitor's session) — it isn't a substitute for
  authenticating every caller. Don't treat an allowed-origin match as proof of a trusted
  caller when reasoning about request volume/cost; the per-route rate limiter
  (`src/utils/rateLimit.ts`) is the actual ceiling there, independent of origin. Fully
  closing this gap would mean either requiring login on guest-usable routes (breaks core
  UX) or real session/token infrastructure — an accepted tradeoff, not an oversight.
- The API key comparison in `proxy.ts` uses a constant-time compare (`secureCompare`,
  hash-then-`timingSafeEqual`) rather than `!==`, now that Proxy defaults to the
  **Node.js runtime** (Next.js 16; renamed from `middleware.ts`, which defaulted to Edge).
- `getClientIp()` (`src/utils/rateLimit.ts`) trusts the first `x-forwarded-for` entry,
  which is correct on Vercel specifically (their edge overwrites this header rather than
  forwarding a client-supplied value). Revisit if this app is ever self-hosted behind a
  different reverse proxy — prefer `@vercel/functions`'s `ipAddress()` there.
- `/api/health` is rate-limited (10/min/IP) and no longer returns raw third-party SDK
  error text in its response body (still logged server-side via `logEvent`) — it makes two
  real billed/quota-limited calls per request, so both mattered.
- `buildSsml()` (`src/utils/voiceHelpers.ts`) XML-escapes `text` before interpolating into
  SSML — fixes a correctness bug too (ordinary dialogue with `&`/`<` already produced
  malformed SSML). `/api/audio`'s `text` param is capped at 2000 characters. Letting the
  client supply this text at all is intentional, not the bug — audio isn't persisted
  server-side (see Account Persistence phase 3c above), so regenerating it after eviction
  requires the client to resupply the original text; escaping/capping was the missing part.
- `scripts/scan-secrets.sh` now matches this app's actual credential shapes (Anthropic
  keys, Google OAuth secrets, Postgres connection strings, Vercel Blob tokens), not just
  PEM private-key blocks. `.env.example` is excluded from scanning since its
  placeholder-shaped values look like credentials by design.
- `.github/workflows/ci.yml` uses `npm ci`, not `npm install`/`npm update`, for
  reproducible builds against the committed lockfile.
- `API_SECRET` was rotated as a precaution. Any external integration outside this repo
  that authenticates with the API key needs the current value from `.env.local`/Vercel.
- `next.config.mjs` sends an explicit `Strict-Transport-Security` header alongside the
  existing CSP/`X-Frame-Options`/`Permissions-Policy` headers.

## Environment variables

Required: `ANTHROPIC_API_KEY`, `API_SECRET` (checked by `proxy.ts`), `GOOGLE_APPLICATION_CREDENTIALS_JSON` (path or raw JSON — for TTS).
Optional: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (enables Cloudflare Workers AI as the primary avatar image provider — see "Avatar generation" above; without them, avatar generation still works via the Pollinations.ai fallback with no config at all), `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` (enables Vercel Blob logging and durable avatar URLs), `TTS_TMP_DIR` (defaults to system temp), `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) to share rate-limit counters across instances, `DATABASE_URL` + `NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (enables account sign-in and persistence — see "Account persistence" above; the app is fully functional as a guest with none of these set), `GAME_TOKEN_SECRET` (optional key for the guessing game's encrypted round token — see "Guessing game" above; falls back to `NEXTAUTH_SECRET` then the already-required `API_SECRET`, so the game works with zero new configuration).

### Rate limiting

`createRateLimiter({ name, max, message, windowMs? })` in `src/utils/rateLimit.ts` wraps every limited route. `name` is required and namespaces the counter (`rl:<name>:<ip>`) — a shared store is shared across routes, so without it `/api/chat` and `/api/audio` would draw down the same budget. With no Redis env vars configured the limiter uses `express-rate-limit`'s in-process MemoryStore, which is correct for local dev and per-instance on Vercel; with them set, `src/utils/rateLimitStore.ts` backs it with an Upstash-compatible Redis REST store and the limits become global. Store outages fail open (`passOnStoreError`) — the limiter throttles, `proxy.ts` authenticates.

## Testing conventions

- Tests live under `tests/`, organized to mirror source (`tests/api`, `tests/app`, `tests/pages`, `tests/src`, `tests/utils`, `tests/integration`, `tests/unit`).
- Mock `authenticatedFetch`, not raw `fetch`, for client/server interaction tests.
- TTS tests must call `tts.__resetSingletonsForTest()` to avoid cross-test singleton state leaking.
- Mock external APIs (Anthropic, GCP TTS/Vertex) rather than calling them live.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
