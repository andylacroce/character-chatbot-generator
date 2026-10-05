# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm install              # install deps
npm run dev               # next dev --turbopack
npm run build              # production build
npm run lint                # eslint . --ext .js,.jsx,.ts,.tsx (includes JSDoc, security, and regex-safety rules)
npm run lint:fix
npm run lint:md              # markdownlint over **/*.md
npm run format                # prettier --write . (excludes *.md — markdownlint owns that)
npm run format:check           # prettier --check .
npm run type-check               # tsc --noEmit
npm run docs:code                 # typedoc -> docs-generated/ (gitignored); see "Code documentation standard"
npm run test                       # jest
npm run test:watch
npm run e2e                          # Playwright smoke synthetics against `next start` (needs a prior build); zero Claude calls, see "Testing conventions"
npm run test:coverage               # jest --coverage (enforces 80% global threshold — see jest.config.cjs)
npm run analyze                      # ANALYZE=true next build (bundle analysis)
npm run sim:games                    # LLM-vs-game simulator (scripts/simulate-games.ts); spends real Anthropic tokens, see "Game simulator"
npm run docs:api                      # regenerate public/openapi.json from @swagger JSDoc comments; runs automatically before dev/build
npm run db:check                       # read-only check that schema.ts matches the live DB; runs automatically before dev and as part of ci
npm run ci                             # format (auto-fix) && lint --max-warnings=0 && lint:md && type-check && mobile ci && shared tests && db:check && docs:code && test:coverage && build && e2e — run this before considering work done
```

Run a single test file: `npx jest tests/api/chat.test.ts`. Run tests matching a name: `npx jest -t "some test description"`.
Coverage is enforced globally at 80% in `jest.config.cjs`.

- **`npm run ci` runs `format` (auto `--write`) first, not `format:check`,** so every later step runs
  against already-formatted code and can't fail on formatting after a long run.
  `.github/workflows/ci.yml` uses `format:check` first instead (fail fast; a workflow can't push a
  fix back). The pre-commit hook (`.githooks/pre-commit`, wired via `npm run prepare`) auto-formats
  staged files, so drift ideally never reaches either.
- **Workflow setup is the shared composite action `.github/actions/setup`** (Node 24, `node_modules`
  cached by lockfile hash so `npm ci` runs only when it changes); new jobs should use it.
- **Any step added to a `ci` script must also be added to the matching workflow;** the workflows
  list steps one by one rather than calling `npm run ci`. Workflows, required checks, the
  Dependabot/Expo upgrade flow, and the `EXPO_UPGRADE_TOKEN` secret are in `.github/CONTRIBUTING.md`.
- **Tool configs that needn't sit at the repo root live in `config/`** (TypeDoc, Drizzle,
  markdownlint; npm scripts pass `--config`/`--options`). Prettier's config is the `"prettier"` key
  in `package.json`. Jest's setup and node-module mocks live in `tests/` (`tests/setup.js`,
  `tests/__mocks__/`). There is no PostCSS config (Next's default already runs autoprefixer).
  The GCP key is never a file: it's inline JSON in `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

## Versioning

Git tags (`vX.Y.Z`, matching `package.json`'s `version`) mark shipped points so a regression can
be bisected against a known-good release. Tagging began 2026-09-22; never back-tag earlier history.

- **PATCH:** bug fixes, refactors, internal cleanup (no new user-visible capability).
  **MINOR:** a new user-facing feature or behavior change. **MAJOR:** essentially never; only for
  a break needing manual action from anyone depending on this app, and only by explicit agreement.
- **Docs-only or pure-chore commits (wording, comments, a no-behavior dependency bump) get no bump
  or tag.**
- **Tag only at a "ship it" moment** (see the global git workflow rule in `~/.claude/CLAUDE.md`)
  that ships a real change, never speculatively or mid-task. Mechanics:
  1. `npm run ci` is already green.
  2. Choose patch vs. minor, then `npm version patch --no-git-tag-version` (or `minor`); the flag
     folds the bump into the normal commit.
  3. Head the shipped `CHANGELOG.md` entry with the version, e.g. `## v0.6.0 — 2026-09-22 — Title`.
  4. Commit the bump and changelog entry with the change.
  5. `git tag -a vX.Y.Z -m "<one-line summary>"` (annotated), then `git push --follow-tags`.
- **Claude Code cloud sessions can't push tags** (their credential can write `refs/heads/*` but not
  `refs/tags/*`). `.github/workflows/tag-release.yml` creates the annotated `v<package.json
  version>` tag on every push to `main` if missing, so a cloud session only does steps 1-4 and
  merges the PR.

## Web/mobile parity (standing goal)

Keep the web app and the mobile app (`apps/mobile`) sharing as much as possible and in sync with
**every commit**. Logic, copy, types, and client state machines live once in `packages/shared`
(`character-chatbot-shared`, which web imports directly via `next.config.mjs`'s
`transpilePackages`); each platform supplies only a thin adapter: its own request transport,
storage, and logging. The guessing game is the model: `useGameSession`/`game.ts` in shared,
wrapped by `src/app/components/useGameController.ts` (SSE progress, localStorage) and
`apps/mobile/src/useGameController.ts` (plain JSON, AsyncStorage). For every change, ship the
other platform's side in the same commit, and move logic that exists on both sides into shared
rather than editing two copies. Mobile diverges only where it has to (React Native's fetch can't
read an SSE stream; Android keyboard handling) or where native features genuinely improve mobile
UX (haptics). A feature that exists on one platform only is a parity gap to call out, not a
default. Mobile-specific notes are in "Mobile app" below.

## Architecture

### Request flow

`src/app/components/useChatController.ts` → `authenticatedFetch()` (`src/utils/api.ts`) →
`src/pages/api/chat.ts`. Every client→server call goes through `authenticatedFetch`, not raw
`fetch`, so it passes through `proxy.ts` auth and tests can mock it consistently.

`proxy.ts` is the single choke point for API auth: it validates request origin (localhost, Vercel
production/preview auto-pass) and enforces a constant-time-compared `x-api-key` against
`API_SECRET` for external origins. A new deployment domain means updating `allowedHosts` in
`proxy.ts` and nowhere else. Host matching is exact (never prefix/substring), and a request with no
`Origin`/`Referer` passes only on a safe method (GET/HEAD/OPTIONS) from a first-party host;
everything else needs the API key. `tests/proxy.test.ts` pins both directions. The Origin/Referer
check is real CSRF protection against a browser but not authentication against a non-browser
client (see "Security posture").

### Chat + streaming (`src/pages/api/chat.ts`)

The most complex endpoint: calls Claude, summarizes history once it exceeds 20 messages
(`src/utils/conversationSummarizer.ts`; a signed-in user's saved character differs, see "Account
persistence"), streams via SSE when the client passes `{ stream: true }`, and does "smart
continuation": it detects a truncated reply, appends "Would you like me to continue?", and resumes
if the user says yes.

SSE frames are plain `data: JSON\n\n`. The final payload is
`{ reply: string, audioFileUrl?: string, done: true }`; changing it requires updating
`useChatController.ts` and every test that parses stream frames.

- **TTS** (`src/utils/tts.ts`, `synthesizeSpeechToFile`) is keyed by a stable `getAudioCacheKey`
  hash to avoid re-synthesizing identical audio. A TTS failure on any path (cache hit,
  non-streaming, streaming) never fails the chat request: it degrades to a text-only reply
  (`audioFileUrl` omitted), since losing audio beats discarding a generated reply.
- **Voice shapes:** persisted configs use Google's `Voice` response shape (`languageCodes`), but
  synthesis builds the separate v1 `VoiceSelectionParams` explicitly (`languageCode` plus exact
  `name`), and sends no `ssmlGender` with a named voice, so stale gender metadata can't make Google
  reject a valid selection. The legacy mismatch self-heal remains only for an unnamed fallback.
- **Voice casting** (`src/utils/characterVoices.ts`) asks the `text-simple` model to infer a
  provider-neutral vocal profile from the personality, then requires the final `voiceName` to come
  from the deployment's live `ListVoices` inventory (cached once per warm process; Google's
  metadata for the chosen name is authoritative; casting never calls `SynthesizeSpeech` just to
  validate). Studio, Neural2, WaveNet, Standard, News, Journey, and Polyglot stay eligible; mature
  v1/SSML controls are preferred over migrating to a newer, less configurable family. The result
  cache includes a hash of the personality context so a corrected or disambiguated name can't
  reuse an incompatible voice.

### Model selection (`src/utils/claudeModelSelector.ts`)

Three tiers, chosen by call site, never by a runtime cost heuristic:

- `"text"`: chat replies only. `claude-sonnet-4-6` in prod, `claude-haiku-4-5-20251001` in dev.
- `"text-simple"`: one-shot structured JSON tasks (personality generation, character validation,
  voice config, suggestion lists, and the games' short verdict reactions). Always
  `claude-haiku-4-5-20251001`.
- `"image"`: avatar prompts render via `gemini-3.1-flash-lite-image` on Google Cloud's Gemini
  Enterprise Agent Platform (formerly Vertex AI; not Claude).

All Claude calls go through the singleton client in `src/utils/anthropicClient.ts`.

### Avatar generation (`src/pages/api/generate-avatar.ts`)

**Free image providers only; no payment method is required.** Claude (`text-simple`) writes an
SFW image prompt from the established name, then the first provider that succeeds renders it:

1. **Cloudflare Workers AI** (`cloudflareImageGen.ts`, `@cf/black-forest-labs/flux-1-schnell`) when
   `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set. Free 10,000 neurons/day; requests
   just fail once exhausted (no paid plan configured).
2. **Pollinations.ai** (`pollinationsImageGen.ts`), anonymous, no key, no daily cap, may render a
   small watermark. Used whenever Cloudflare is unset, errors, or trips its safety filter.

Each provider returns `null` on any failure instead of throwing, so the handler's `if (!avatarUrl)`
fallthrough chains them. **Both `fetch()` calls carry `AbortSignal.timeout(25000)`:** plain
`fetch` has no timeout, and a stalled Pollinations request once hung the game's `start`/`continue`
forever. With `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN`, the image uploads to Vercel
Blob (`avatars/<uuid>.<ext>`, public) and a durable URL is returned; otherwise, or on upload
failure, a base64 data URL. Rate-limited to 5/min/IP.

- **The route re-checks moderation itself:** `generate-avatar.ts` is callable directly, so a
  blocklisted name never gets a shared or persisted portrait (content blocks get the silhouette,
  copyright blocks only the private `skipPersistence` render); the allowlist wins. A never-validated
  new name can still reach the Wall by calling it directly (a signed proof from validate-character
  would be needed to close that).
- **`avatar_cache`** (global, deliberately not environment-scoped, or the cost savings vanish) is
  keyed by lowercased name and checked before any generation. Only real generations are cached,
  never the `/silhouette.svg` fallback. `gender` is cached too (callers need it for voice
  selection). `category` comes from the same Claude response that writes the image prompt (see
  Character Wall). Reads and writes no-op without `DATABASE_URL` or on error.
- **Fuzzy name matching happens earlier, in `generate-personality.ts`.** `generatePersonalityPrompt`
  (`src/config/serverConfig.ts`) folds up to 300 existing `avatar_cache` names into the same Claude
  call and asks for `correctedName`: the input with spelling and casing fixed, or an existing name
  when it's clearly a misspelling of one. `correctedName` flows unchanged to `/api/generate-avatar`,
  so "sherlok holmes" hits the "Sherlock Holmes" row rather than a duplicate.
- **`correctedName` also expands to the fullest commonly recognized name** ("Einstein" → "Albert
  Einstein"), via `fullNameGuidance`. Conservative on purpose: (1) never invent a surname for a
  one-name figure (Zeus, Gandalf); (2) an expansion must add real identifying information that
  resolves to one individual, never swap one vague epithet for another or produce a still-ambiguous
  title ("Buckingham" → "Duke of Buckingham"); (3) never replace a pen or stage name that is itself
  the recognized form with a birth name (Molière); (4) never guess between two similarly famous
  people (Brutus). Every downstream store inherits it: `avatarCache.displayName`/`characterName`,
  `bots.name`, and the versioned localStorage keys.
- **`avatarCache.displayName`** stores the properly-cased `correctedName` at write time, the only
  place the casing is known. `chars.ts` prefers it over its lossy regex `toDisplayName` fallback
  (which can't know "III" stays uppercase or "of"/"van" stay lowercase); it is nullable for older rows.

### Copyright/trademark validation

Bot creation is gated by a server round-trip, not just a client check:

1. `useBotCreation.ts` calls `POST /api/validate-character` with `{ characterName }`.
2. `src/pages/api/validate-character.ts` (Claude, rate-limited 30/min, `temperature: 0`) classifies
   `{ level: "warning" | "caution" | "none", message?, suggestions?, blocked, recognized }`:
   "warning" = clear violation (Mickey Mouse), "caution" = possible concern (Superman), "none" = safe.
3. On warning/caution, `CopyrightWarningModal.tsx` shows the message plus public-domain
   alternatives from `GET /api/random-character`.

Changing this flow touches the API, the modal, `tests/api/validateCharacter.test.ts`, and
`tests/app/components/CopyrightWarningModal.test.tsx`.

**A name is checked against three persistent tables around the Claude call,** because a
non-deterministic classifier must never override what the app already hand-vetted (a cached,
public character once popped a fresh warning on a later launch):

- **`characterAllowlist.ts`** (`character_allowlist`) is a permanent circuit-breaker checked
  first, before Claude. Sources: the static curated list `src/data/characterNames.ts` plus an
  admin-managed table. A hit also removes any stale blocklist row for the name.
- **`characterBlocklist.ts`** (`character_blocklist`) is checked next. A hit skips Claude, scrubs
  any cached avatar, and returns a hard, non-overridable block with a generic message
  (`scrubbed: true`). Rows are added automatically when Claude classifies a name `"warning"`
  (`source: "claude"`, fire-and-forget; that first attempt still gets the ordinary overridable
  warning, only repeats hit the hard block) or `blocked: true`, and manually via
  `/admin/moderation` (`source: "admin"`). Each row has a `category`: `"copyright"` (repeat hit
  returns `warningLevel: "warning"` + `scrubbed: true`) or `"content"` (repeat hit returns
  `blocked: true`). Legacy rows default to `"copyright"`.
- **All three helpers wrap their DB calls in `safeDb`** (`src/utils/safeDb.ts`): a no-op fallback without `DATABASE_URL`, and a logged `error` plus fallback on any DB failure, so moderation never blocks creation.
- **`characterWarningLog.ts`** (`character_warning_log`) is an append-only record of every
  "warning" Claude has returned. Unlike the allow/blocklist it is never deduplicated, so it alone
  answers "what was flagged this week" and backs the "Recently warned" panel.

**`blocked: true` is a separate, non-overridable check** from the same Claude call, for (1) a
profane, slur, or sexually explicit name, and (2) a real, currently-living person with a serious,
well-documented criminal conviction or extensive credible allegations of serious criminal conduct
(the prompt carries a worked example). The second is deliberately narrow: never historical or
deceased figures however controversial, never ordinary celebrity or political controversy.
`useBotCreation.ts` short-circuits to a plain error without showing the modal's "Continue Anyway",
because every created name and portrait can land on the public `/chars` wall (and, privately, in a
user's saved characters). On a validation error, `blocked` and `warningLevel` fail open
(`false`/`"none"`), so a Claude outage doesn't block creation.

- **`scrubbed: true`** (blocklist hit, or a fresh "warning" for an already-cached name) is treated
  like `blocked`: a hard stop with "This character is no longer available".
- **Blocking scrubs everywhere:** `avatarGeneration.ts`'s `scrubCachedAvatar` and
  `scrubUserBotsByName` delete the shared cache row and every user's saved `bots` row for the name
  (case-insensitive, all users and environments; `messages` cascade). The manual admin add does the
  same immediately and defaults to `category: "content"` unless it passes `"copyright"`.
- **The prompt separates** "a name meaningful only because of one corporate work" (`warning`:
  Spider-Man, Pikachu) from "a mythological, historical, or pre-1928 figure a studio also adapted"
  (`none`: Thor, Sherlock Holmes, Winnie-the-Pooh, Hercules), with those worked examples inline.
- **`/admin/moderation`** (`src/app/admin/moderation/`, `AdminModerationView.tsx`) is one page with
  three sections: "Recently warned" (read-only, time-window filter, `GET /api/admin/warnings`, inline
  Allow/Block), "Allowed", and "Blocked" (CRUD via `POST`/`DELETE` on
  `src/pages/api/admin/{allowlist,blocklist}.ts`, plus "Move to X"). A name is never on both lists:
  each list's `POST` removes it from the other server-side, which is what makes Move and the warning
  log's buttons work. A `refreshKey` bumped on any mutation re-fetches every section. The table uses
  `table-layout: fixed` with ellipsis (one line per row) and drops Reason/Source/Added below 640px
  (icon-only actions keep `aria-label`/`title`); scrolling and stacked-card layouts were rejected.
- **Overriding a warning/caution never persists anything server-side.** `useBotCreation.ts` sets
  `skipPersistence` on the `Bot` when the user clicks "Continue Anyway". `generate-avatar.ts`
  (`bypassPersistence`) then skips `avatar_cache` and Vercel Blob (returns the base64 data URL),
  `index.tsx`'s `handleBotCreated` skips `POST /api/bots` (the character behaves like a guest's,
  localStorage only), `ChatHeader.tsx` hides Download Transcript, and the modal's disclaimer says so.

### Supported-character gate (unrecognized names)

The same validation call also returns `recognized: boolean` (an established fictional, historical,
mythological, religious, or folklore figure Claude knows; a bare common noun or generic archetype
counts as unrecognized). `false` is a non-overridable stop in shared `useCharacterCreation`: web
and mobile show the same "couldn't identify" error and never call personality, avatar, or voice
generation. It defaults to `true` on transport/server errors so a Claude outage doesn't disable
chat. Original-character creation was removed in v0.24.0. Legacy `skipPersistence` sessions are
deleted from local storage by `getValidBotFromStorage` (web) and `loadBot` (mobile) instead of
resuming.

### Account persistence

Optional accounts with server-persisted bots and history, additive: guest usage works unchanged and
everything no-ops (200, empty) for guests or without `DATABASE_URL`, never a 401.

- **Auth:** Auth.js (`next-auth@4`, stable; v5's `auth()` is App-Router-only) with Google, JWT
  sessions (no `sessions` table). `src/auth/authOptions.ts` holds config;
  `src/pages/api/auth/[...nextauth].ts` mounts it in Pages Router. Use
  `src/utils/getSessionUserId.ts` in any handler needing the signed-in user, never a client-supplied
  id. `proxy.ts` bypasses its origin/key check for `/api/auth/*` (Auth.js has its own CSRF/state
  cookies, and Google's callback carries Google's Referer). `next.config.mjs`'s CSP `form-action`
  must allow `https://accounts.google.com` (Chrome enforces `form-action` against the redirect
  target, so it's otherwise blocked silently); extend it for any new provider.
- **Preview:** Google has no wildcard redirect URIs, so real sign-in works only on the production
  domain. On `VERCEL_ENV === "preview"` a stub `Credentials` provider (`id: "preview-stub"`) issues
  an unverified, non-DB session from an email string, swapped in rather than added, and guarded
  twice (excluded from `providers` and rechecked in `authorize()`).
- **Google sets `allowDangerousEmailAccountLinking: true`** (a documented next-auth v4 opt-in; see
  `authOptions.ts` before extending to any new provider). Magic-link email sign-in also exists
  (`EMAIL_SERVER` + `EMAIL_FROM`, needs `DATABASE_URL`). Facebook sign-in was built and removed
  (see `docs/decisions-history.md`).
- **DB:** Drizzle on Neon. `src/db/client.ts`'s `getDb()` is a lazy singleton; it must never
  connect at import time (`next build` bundles handlers and would fail with no `DATABASE_URL`).
  The Drizzle adapter attaches only when `DATABASE_URL` is set. Apply schema changes with
  `npm run db:push` (not in `ci`, it mutates external state).
- **`SessionProvider` lives in its own `"use client"` wrapper** (`Providers.tsx`); inline in the
  root layout it breaks `next build`'s static prerender of `/`.
- **Sign-in UI:** `AuthControl.tsx` on the landing page opens an in-page `SignInModal` (Continue with
  Google) instead of redirecting off-site with no context; the preview stub skips the lightbox.
  `authOptions.ts`'s `pages.signIn: "/auth/signin"` (`AuthSignInPage.tsx`) exists for mobile's
  sign-in bridge (no lightbox to render into). It mirrors `SignInModal`'s `signIn()` calls and
  styling in its own CSS module, hides providers via `getProviders()` when unconfigured, and reads
  `?callbackUrl=`/`?error=`.
- **Environment scoping, not separate databases:** one Neon database serves dev, Preview, and
  Production, walled by an `environment` column (`getCurrentEnvironment()` in
  `src/utils/environment.ts`, from `VERCEL_ENV`, else `"development"`). Every `bots` query must
  filter on it. Not applied to `users`/`accounts` (identity is the same everywhere) or
  `avatar_cache` (intentionally global).
- **`bots`** (`src/pages/api/bots.ts`: `POST` upsert, `GET` list most-recently-updated first) is
  wired fire-and-forget into `index.tsx`'s `handleBotCreated`, so a persistence failure never
  breaks creation. **`/history`** ("Past chats", `HistoryPage.tsx`, signed-in only, linked from the
  landing footer and account menu) lists saved characters with `formatRelativeTime`. It's named
  `history`, not `chats`, to avoid confusion with `ChatPage`/`useChatController`. Rows link to
  `/?name=<name>`, the Wall's launch point, which resumes the saved character; identity
  (name/personality/avatar/voice) restores synchronously and history catches up via `messages`.
- **Server-persisted chat history (`messages` table).** For a signed-in user's saved character,
  `chat.ts` is the source of truth for personality and history rather than trusting the client's.
  It looks up the `bots` row by `(user_id, name, environment)`; guests, no `DATABASE_URL`, or
  never-saved characters (e.g. copyright overrides) fall through to client-authoritative behavior.
  - **Rolling summary:** `bots.summary`/`summarizedThroughMessageId` replace re-summarizing from
    scratch. Each turn fetches messages after the checkpoint; if that tail exceeds 20, the oldest
    excess folds into a new summary via `summarizeConversation`'s `priorSummary` and the checkpoint
    advances. (The client already pre-trims to 20 before sending, so this DB path is what makes
    summarization real.)
  - **Write path:** after each reply path (cache hit, streaming, non-streaming),
    `finalizeChatPersistence` fire-and-forget inserts the user/bot pair and any checkpoint update;
    failures are logged and never discard a reply. The intro message goes through the same path.
  - **Read path:** `GET /api/messages?botName=` (GET-only) returns oldest-first, capped at 200.
    `useChatController.ts` seeds from localStorage instantly, then (signed in) adopts the server
    list only if longer (new device / cleared storage).
  - **Schema drift guard:** forgetting `db:push` after editing `schema.ts` broke live dev/prod twice
    (`users.preferred_name`, `avatar_cache.display_name`). `npm run db:check`
    (`scripts/check-db-schema.cjs`) regex-scans `schema.ts` columns against
    `information_schema.columns` and fails if the live DB lacks one. It runs on `predev` and in `ci`,
    is read-only, and no-ops without `DATABASE_URL` (so it's a no-op on GitHub Actions). It
    deliberately never runs `db:push`: that stays an explicit, reviewed action on a shared database.
- **Self-serve account deletion:** `DELETE /api/account` (5/min) deletes the `users` row, cascading
  through `accounts`/`bots`/`messages` and both games' account-scoped tables;
  `analytics_events.user_id` is `set null`. It also removes the email's `verification_tokens`, this
  device's guest-scoped rows in **both** games' result and leaderboard-profile tables
  (`guess_who_results`/`guess_who_guest_profiles`, `guess_who_next_results`/
  `guess_who_next_guest_profiles`, keyed by cookie so no FK cascade reaches them; mobile sends
  `x-game-guest`) plus the cookie (`clearGuestId`), and, via `userBlobs.ts`'s `deleteUserBlobs`,
  Blob avatars no remaining `avatar_cache`/`bots` row references plus the user's chat logs. A Blob
  failure after the DB delete logs `account_delete_blob_failed` but still returns success. Clients
  (web `useAccountMenu` via `ConfirmDialog.tsx`, mobile `AccountModal` → `AuthContext.deleteAccount`)
  clear personal local keys via shared `isPersonalStorageKey` (keeping dark mode, audio, GA consent,
  carousel cache) and sign out. Known gap: a JWT on another device stays decodable until expiry;
  its writes fail the `users` FK and degrade like any persistence error.
  **A new per-user table needs an `onDelete: "cascade"` FK to `users`; a new guest-scoped table
  needs an explicit delete here keyed by guest cookie,** or deletion silently misses it (a missing
  pair of Guess Who guest tables was exactly this gap, fixed 2026-09-29; `tests/pages/api/account.test.ts`
  asserts all four).
- **Deleting chats (Past chats):** `DELETE /api/bots` clears every saved character in the current
  environment; `?id=<id>` deletes one. Messages cascade; `deleteUserBlobs` removes portraits only
  those rows used, and on clear-all (`chatLogs: true`) the user's chat logs (per-account, so a
  single delete leaves them). Clients confirm, delete server-side, then remove local keys
  (`chatStorageKeys(name)` / `isChatHistoryStorageKey`).
- **`/api/audio` accepts only bare `.mp3` names** (a name without the extension made the `.txt`
  sidecar path equal the audio path) and never calls Claude to improvise a reply; it looks up a voice
  only when it must synthesize. `audioFileCleanup` deletes only file names this app creates, since the
  OS temp dir is shared.
- **Chat troubleshooting logs** (`log-message.ts`) never store IP addresses (an IP would tie an
  anonymous log to a person, which the privacy policy promises against). A signed-in user's logs
  live under `chat-logs/users/<sha256(userId)>/` (`chatLogPrefix`) so deletion can find them; guest
  logs stay at the root, unlinked. Older signed-in logs predate the prefix and can only be removed
  by hand on an email request.
- **Tracking:** [issue #830](https://github.com/andylacroce/character-chatbot-generator/issues/830)
  covers the migration; keep it current (`gh issue edit 830 --body-file`, `gh issue comment`) when
  a phase completes.

### Rate limiting

`createRateLimiter({ name, max, message, windowMs? })` in `src/utils/rateLimit.ts` wraps every limited route. `name` is required and namespaces the counter (`rl:<name>:<ip>`) — a shared store is shared across routes, so without it `/api/chat` and `/api/audio` would draw down the same budget. With no Redis env vars configured the limiter uses `express-rate-limit`'s in-process MemoryStore, which is correct for local dev and per-instance on Vercel; with them set, `src/utils/rateLimitStore.ts` backs it with an Upstash-compatible Redis REST store and the limits become global. Store outages fail open (`passOnStoreError`) — the limiter throttles, `proxy.ts` authenticates.

### Module system (do not regress)

`package.json` intentionally has no `"type": "module"`: removing it once caused a Vercel
`ERR_REQUIRE_ESM` crash, because Next's CJS serverless launcher couldn't `require()` compiled API
route output. `next.config.mjs` uses an explicit `.mjs` extension so it's still ESM. Source
(TS, `import`/`export`) compiles fine either way via SWC; don't re-add `"type": "module"`.

## Features

### Character Wall (`/chars`)

A public, no-auth gallery of every supported portrait in `avatar_cache` (anyone can already
discover a row by typing its name, so nothing new is disclosed). Every
`avatar_cache` row is recognized (legacy unsupported rows were deleted), so `chars.ts` no longer filters.

- **`avatar_cache.category`** (`packages/shared/src/characterCategories.ts`) is a nullable taxonomy
  of six identifiers: `history`, `mythology`, `literature`, `folklore`, `religion`, `other`; missing
  or unknown values degrade to `other`.
- **`chars.ts`** is `GET`-only, paginated (`limit`/`offset`, default 60, max 100, `hasMore`).
  `sort`: `newest` (default), `oldest`, `name-asc`, `name-desc`; `group`: `none` (default) or
  `category` (taxonomy order primary, sort secondary). The full list is ordered before pagination
  and held in a per-instance 60s in-process cache (`getAllCharacters()`), so infinite scroll costs
  at most one table scan a minute per warm instance (same tradeoff class as the rate limiter's
  MemoryStore). `?name=` resolves a single entry; `sample=N` returns N of the newest `limit`.
- **`CharsGallery.tsx`:** a slim Sort-by select and Group-by-category switch; grouping reloads from
  offset zero with all categories collapsed, and stale in-flight responses are ignored. One
  tattered-parchment surface with a CSS multi-column masonry of two to six columns (never one, even
  under 380px); each tile's aspect ratio and rotation come from a djb2 hash of the name
  (`hashString`) so pagination never reshuffles. A `.dark`-scoped charred-parchment palette follows
  the app theme. Infinite scroll uses a callback ref + `IntersectionObserver` on the
  conditionally-rendered sentinel (a mount-time ref effect would miss it). "To top" reads `body`,
  window, `documentElement`, and `scrollingElement` (`body` is the real scroll owner under the
  flex-root layout), appears after 360px, and uses `scrollIntoView()` on a marker before the
  header. A native `<dialog>` lightbox is wrapped in the View Transitions API when available.
- **Back control:** the header's arrow + "Back" calls browser history and falls back to `/` only
  when there's no same-app entry. It deliberately doesn't use `window.history.length` (a fresh tab
  already reads 2 because of `about:blank`); `src/utils/clientNavigationState.ts` holds an in-memory
  flag set by `Providers.tsx` on the first `usePathname()` change. The page uses the shared
  `AppHeader`, `BackHomeLink`, and `useAccountMenu()`.
- **"Chat with this character" links to `/?name=<encoded>`,** the same launch point
  `BotCreator.tsx` reads via `useSearchParams()`. `isLaunchingFromUrl` hides the whole creator UI
  for a bare spinner. Resolution: signed in with a saved `bots` row of that exact name
  (case-insensitive) → resume it via `persistedBotToBot()`; otherwise `handleCreate()`.
  **StrictMode footgun, don't reintroduce:** `hasAutoSubmittedRef` is set synchronously before the
  `/api/bots` await. React 18 StrictMode double-runs effects without resetting refs, so cleanup
  during the in-flight fetch dropped the first result while the second run saw the guard set and
  bailed, hanging on the spinner forever. Fix: track a local `dispatched` flag and release the guard
  in cleanup only if nothing was dispatched. `tests/app/components/BotCreator.url.test.tsx` pins it.

### Voice input (speech-to-text)

`useSpeechRecognition.ts` wraps the browser's native `SpeechRecognition`/`webkitSpeechRecognition`
(Chrome/Edge; absent in Firefox, inconsistent in Safari), deliberately not a server round-trip, so
it costs nothing and needs no route. It returns `isSupported`/`isRecording`/`transcript`/`error`
plus `startRecording`/`stopRecording`/`toggleRecording`; each integration point (ordinary chat and
the games' `ChatInput.tsx`, and `BotCreator.tsx`'s name field) owns its own wiring and all use
`normalizeDictatedText`.

- **The mic is a toggle** (click to start, click to stop), like the mute button. It renders only
  when `isSpeechSupported` and is hidden while `isAudioPlaying` (caps mobile icon buttons at 3).
  `BotCreator.tsx` has its own inline markup/CSS and hides it while busy.
- **`normalizeDictatedText`** only fixes capitalization and punctuation spacing. Real correction
  would need a Claude call, which breaks the zero-cost design.
- **Starting a recording overwrites the input** (avoids interim-result flicker). The controllers
  (`useChatController.ts`, `useGameController.ts`, `BotCreator.tsx`) sync the transcript into their
  input, force-stop on submit, and route speech errors to their own error banner. The game keeps its
  speech error in local state (`speechErrorDisplay`) because `useGameSession` has no settable error.
- **`next.config.mjs`'s `Permissions-Policy` allows `microphone=(self)`.**
- **Mobile has no voice input, a deliberate, evaluated gap (declined 2026-09-27).** The best Expo
  library (`expo-speech-recognition`) needs a custom dev client, which mobile avoids on purpose. The
  Expo-Go-compatible alternative (record → upload → Google Cloud Speech-to-Text, prototyped on a
  branch with AMR_WB on Android, LINEAR16 on iOS, and a 20s recording cap) was declined not for cost
  (~$0.002-0.003 per message) but because it sends a user's own recorded voice to a cloud API, a
  privacy tradeoff web's free native path never makes, for a feature nobody has asked for. Revisit
  either path if real demand appears.

### Client-side storage

`src/utils/storage.ts` wraps `localStorage` with an in-memory fallback (used in tests). Keys
(`packages/shared/src/storageKeys.ts`): `chatbot-bot`, `chatbot-history-<bot.name>`,
`voiceConfig-<bot.name>` (versioned; use the versioned helpers, never write the shape directly),
`audioEnabled`, `darkMode`, `bot-session-id`, `chatbot-user-name` and
`chatbot-user-name-gate-skipped` (see "Personalized greeting"), the games' token/state/
instructions-seen keys (see the game sections), `chatbot-landing-carousel-cache`, and
`portrayal-google-analytics-consent` (web-only `granted`/`denied`, never an identifier). Never store
secrets or PII here.

### Personalized greeting (the visitor's own name)

Separate from accounts: the app tracks what a character should call the *human*.
`users.preferredName` is deliberately distinct from Auth.js's `users.name` (from the OAuth profile,
used only for the "Sign out (X)" label); this one is explicit and user-typed.

- **Capture is a one-time gate, not a standing field.** `useBotCreation.ts`'s `handleCreate()`
  pauses (`showNameGateModal`) the first time a browser submits with no name known
  (`userNameCtx.isResolved && !name && !hasSkippedGate`) and shows `NameCaptureModal`
  (`mode="gate"`): "Continue" saves and resumes, "Skip for now" sets
  `chatbot-user-name-gate-skipped` and resumes. One insertion point covers every `handleCreate()`
  caller (form, modal continuations, `?name=` auto-launch). A masthead icon and a stacked field were
  tried and rejected (missed, or cluttered the main flow).
- **Editable anytime** via the account menu ("Add your name"/"Change your name", `mode="edit"`).
- **Guest:** localStorage only (`chatbot-user-name`, `chatbot-user-name-gate-skipped`);
  `useChatController.ts` sends it as `userName` on every `/api/chat`.
- **Signed in:** `src/pages/api/user-profile.ts` (`GET`/`POST`) persists to `users.preferredName`;
  `useUserName.ts` seeds the DB once from a pre-existing guest value on first sign-in.
- **Server precedence (`chat.ts`):** for a signed-in user the DB value wins once set (server
  authoritative, like `personality` for a saved bot), so a request can't spoof another name;
  otherwise the client's `userName` (sanitized by `sanitizeUserName`, which keeps apostrophes and
  hyphens unlike `sanitizeCharacterName`). When present it goes in the system prompt as a
  `<user_name>` block (same prompt-injection mitigation as `<character_persona>`) and into the reply
  cache key, so differently-named users can't get a cross-contaminated cached greeting.
- **Shown in the transcript:** `ChatMessage.tsx` shows the visitor's name instead of "Me" (threaded
  from one `useUserName()` in `ChatPage.tsx`), updating live; `downloadTranscript.ts` and
  `transcript.ts` accept `userName` too. Optional everywhere; not part of the `messages` table.
- **Sign-in shares one `SignInModal` per page** between `NameCaptureModal` (via `onRequestSignIn`)
  and `useAccountMenu`'s `AuthControl`, rendered as a sibling of the header. Rendering it inside the
  hamburger dropdown let `HamburgerMenu.module.css`'s `.menuDropdown button` reset strip the
  buttons' styling, since a `position: fixed` modal is still a DOM descendant.

### Unified header

`AppHeader.tsx` is the one header for chat, game, landing, and the Wall: `{ menuItems, menuSide?,
center, extra? }` with a plain 3-bar hamburger. Its CSS module carries only the generic shell
(sticky bar, left/center/right grid); page-specific content lives in that page's own module, per
the "no shared CSS modules" rule (descendant selectors leaking across components; a genuinely
atomic single-class rule such as `.menuDivider` lives once in `globals.css` by literal class name).

- **No identity-chip trigger.** The dark-mode toggle and (where a page's items include it) the
  signed-in identity are folded into the hamburger dropdown, which `AppHeader.tsx` appends after
  each caller's `menuItems` (a mobile header can't fit a name, avatar, toggle, and chip in ~390px).
- **`useAccountMenu.tsx`** returns `{ userNameCtx, menuItems, modals, requestSignIn }` and is used by
  `BotCreator`, `CharsGallery`, `ChatPage`, and `GamePage` (page items first, then a `menuDivider`).
  `menuItems` leads with a non-interactive identity label ("Guest" or name/email), then change-name,
  an "Admin" sub-section (Stats `FaUserShield`, Moderation `FaBan`) when `GET /api/admin/is-admin`
  reports true, then `<AuthControl onRequestSignIn={requestSignIn}>`. `modals` renders one shared
  `NameCaptureModal` and one `SignInModal` per page.
- **Slots:** `BotCreator`'s `center` is `LandingCharacterCarousel`; `CharsGallery`'s is a
  `BackHomeLink` pill (`BackHomeLink.tsx`, also on the game start screen); chat and game (via
  `ChatShell.tsx`) use `menuSide="left"` with the character's avatar + name as `center` and a
  personal brand link as `extra`.
- **Signing in or out always redirects to `/`** (every `signIn`/`signOut` passes `callbackUrl:
  "/"`), since both are reachable mid-chat. `callbackUrl` alone isn't enough: `index.tsx`'s `Home`
  renders `ChatPage` whenever a bot session is in localStorage, so `clearStoredBot()` runs just before
  the Google/preview-stub `signIn()` and `signOut()` (not magic-link, which doesn't navigate).
- **`LandingCharacterCarousel.tsx`** rotates through recognized characters via
  `GET /api/chars?limit=100&sample=20` (the API samples, so the client doesn't download unused
  portraits, including large base64 URLs). It advances every 4s, preloads the next portrait, and
  pauses on hover/focus. The landing-only `wideCenter` mode is a one-row 3:1 grid with the image
  fading toward the controls; desktop uses a taller face-level crop (about 42% from the top), mobile
  a compact 22%. Clicking goes to `/chars?name=<encoded>`, which `CharsGallery` resolves via
  `GET /api/chars?name=...` and opens in the lightbox without waiting for the page. Fixed
  dimensions prevent layout shift. **The empty state paints the cached sample first:** the last
  sample lives in `localStorage` (`landingCarouselCache`), read in the same effect as the fetch (not
  a lazy `useState` initializer, which would hydration-mismatch the server placeholder); a fresh
  non-empty response replaces both, and an empty or failed fetch keeps the cache. Only a first-ever
  visit waits on the network, and its placeholder (`.portraitLoading`) pulses (respecting
  `prefers-reduced-motion`).
- **The landing page is a responsive dashboard:** the launcher is the dominant panel and both
  games a compact secondary panel. At 820px and below it is one column; game cards stay side by
  side on phones and stack only below 340px. Spacing and type use clamps; the form scroller is the
  short-viewport fallback. Dark mode removes the light theme's ambient wash and shadows for flat
  solid surfaces with borders.
- **CSS specificity gotcha:** a generic `.headerCenter > button { display: block }` in the shared
  `AppHeader.module.css` (0,1,1) once beat the carousel's own `.carousel { display: flex }` (0,1,0)
  because its root is also a `<button>` there, collapsing the layout. The rule was moved to the
  specific `.avatarButton` in `ChatPage.module.css`. A broad selector in a shared module can break
  an unrelated component with the same DOM shape.

### Guessing games: one engine, two definitions

"Guess Who" and "Guess Who's Next" are **one engine with two `GameDefinition`s**; a game change is
one edit reaching web, mobile, and both games. Only what genuinely differs lives in a definition.

- **`packages/shared/src/game.ts`** holds `GUESS_WHO`/`GUESS_WHO_NEXT` (`GAMES`, `GAME_LIST`,
  Guess Who first) and the pure logic: response parsing, `applyGameMessageResponse`,
  `revealGameMessages`, and `createGameTransport(game, io)` (URLs, per-game wire token name,
  validation over a platform's raw `get`/`post`/`round` primitives). `useGameSession.ts` is the one
  client state machine. A definition carries `slug`, `tokenField`, `eventPrefix`, `hidesSpeaker`,
  `storageKeys`, and `copy` (`gameCopy.ts`).
- **`hidesSpeaker` is the one behavioral difference.** `false` (Guess Who's Next): a named, shown
  character steers toward a *different*, hidden one. `true` (Guess Who): the character you chat
  with *is* the mystery; its name and avatar are generated eagerly but live only in the encrypted
  token until a correct guess, second wrong guess, or give-up. The header shows a silhouette and
  "???" until then, and **a reveal retroactively rewrites the round's already-shown transcript**
  (`revealGameMessages`).
- **Server: one implementation per endpoint under `src/pages/api/[game]/`** (`start`, `continue`,
  `message`, `give-up`, `high-score`, `leaderboard`, `leaderboard-settings`), wrapped by
  `src/utils/game/route.ts`'s `gameRoute` (resolves `[game]`, 404 otherwise, per-game-per-endpoint
  limiter `<slug>-<endpoint>`, request log). One `@swagger` block per route covers both games via a
  shared `Game` path parameter. `src/utils/game/` holds `definitions.ts` (slug lookup, score
  tables; no Claude imports), `token.ts`, `round.ts` (`planRound`, `generateGameRound`), and
  `scores.ts` (parameterized on `game.tables`).
- **The wire format is unchanged on purpose.** Each game keeps its historical token field
  (`guessWhoToken`/`gameToken`), URLs, response fields, and analytics event names
  (`guess_who_*`/`guess_who_next_*`) so released mobile builds keep working. Clients normalize to
  `token` at the boundary.
- **One token payload** (`GameState`: `speakerName`, `targetName`, equal in Guess Who) with a
  **`game` discriminator so a token never verifies against the other game's routes.**
- **Persisted client state keeps its on-disk layout** (token under `storageKeys.token`, the rest as
  JSON under `storageKeys.transcript`) so older saves resume. The platform controllers
  (`useGameController.ts` on web, `apps/mobile/src/useGameController.ts`) supply only transport,
  storage, logger, audio, and (web) SSE progress. `GamePage.tsx`/`GamePage.module.css` and
  `GameScreen.tsx` (exporting `GuessWhoScreen`/`GuessWhoNextScreen`) are one component each.
- **`src/utils/classifyGuess.ts`** is the classifier both games share (few-shot examples live once).
- **DB tables stay separate per game** (`guess_who_*`, `guess_who_next_*`): selected by config, and
  merging would add a production migration for almost no code saved. `schema.ts` keeps them
  explicit because `scripts/check-db-schema.cjs` regex-scans it.
- **Tests run each shared flow once per game** (`describe.each`); fixtures in
  `tests/helpers/gameRoute.ts`.

### Game mechanics shared by both games

- **Round state lives in a signed, encrypted, opaque token, not a DB row.** `GameState` carries the
  names, the current persona prompt, avatar/gender/voiceConfig, streak, wrong-guess count, and
  `usedNames` (no repeats). `signGameState`/`verifyGameState` wrap it in one AES-256-GCM token the
  client echoes on every call. This keeps the hidden name unreadable to the client and keeps
  gameplay working for guests with no database.
- **The key derives from `GAME_TOKEN_SECRET ?? NEXTAUTH_SECRET ?? API_SECRET`** (`getKey()`), never
  a per-process random key, so it's stable across Vercel instances with no new required config.
  Only a deliberate rotation invalidates a run, degrading to a friendly "start a new game" 400.
- **Tokens are stateless, so a run's end is recorded server-side.** Old tokens stay decryptable and
  give-up reveals the answer, so replaying one would turn the reveal into a scored win. Give-up and a
  second wrong guess call `markRunEnded` (sets `ended_at` on the run's `*_results` row, inserting a
  0-streak row if none exists); a correct guess skips scoring when `isRunEnded`. Known limit: a
  first-wrong token can still be replayed for extra wrong guesses (no server-side strike count).
  A hidden-speaker game's `/api/audio` URL is built with a neutral `botName` and no `gender`
  (`synthesizeReplyAudio`'s `hideIdentity`), or the URL would hand over the answer.
- **`verifyGameState()` fails CLOSED** (any tamper, malformed input, or decrypt failure returns
  `null` and `message.ts` returns a hard 400), the one deliberate exception to this codebase's
  usual fail-open convention.
- **Character, avatar, and voice pipelines are shared with ordinary bot creation** and called
  in-process: `pickRandomCharacterName.ts`, `avatarGeneration.ts`'s `getOrGenerateAvatar`, and
  `characterVoices.ts`'s `getVoiceConfigForCharacter`. An avatar/voice is only resolved for the
  character actually shown, never the hidden one (no spoiler).
- **`generateGameRound(currentCharacterName, excludeNames, onProgress?)`** (`round.ts`) is the one
  place the persona → avatar → opening reply → voice → TTS sequence lives, for both `start.ts` and
  `continue.ts`. It runs `[persona ‖ avatar] → [opening reply ‖ voice config] → TTS`.
- **`gameReply.ts`** has the three Claude-call shapes: `getGameReply` (an in-character turn, with
  optional `extraInstruction`), `getOpeningReply` (never throws, falls back), and
  `getGuessReactionReply` (the confirm/deny/reveal line after a guess is judged; never throws). The
  reaction call gets only the authoritative outcome and canonical revealed name, never the raw
  guess, so correctness is settled once and a second model call can't contradict the banner. The
  never-throws guarantee matters on a correct guess: a Claude hiccup building the *next* greeting
  must not turn a win into a 500.
- **Generating the next character is deferred until "Continue."** `message.ts`'s correct branch
  only judges and returns the reaction plus the new streak; `continueRound()` in the controller
  calls `continue.ts` (which reads the still-valid token for `nextCharacterName`/`usedNames` and
  runs `generateGameRound`). `continue.ts` refuses to advance until the token's `canContinue` is
  true (set only by a judged-correct response). On failure the "Correct!" banner is restored with an
  error so the player can retry.
- **The "Correct!" moment is an inline banner, not a modal** (a modal obscured the last message).
  `GamePage.tsx`'s `bannerContent` slot sits above the transcript; `awaitingContinue` is derived
  from `lastEvent?.type === "correct"`. After Continue, the same staged progress spinner as the
  start screen replaces it, and the input stays disabled
  (`apiAvailable={!awaitingContinue && !continuing}`).
- **Progress is real, server-reported SSE, not a timer.** `start.ts`/`continue.ts` accept
  `stream: true` and write `data: {"stage": "personality"|"avatar"|"reply"|"voice", "done": false}`
  frames as each step completes, then a final `done: true` frame with the normal response fields.
  `useGameRoundProgress.ts`'s `fetchRoundWithProgress` (`readSseFrames`) shows the first stage not
  yet complete (pairs resolve in either order) and holds on "Preparing greeting…" until the final
  frame. This is the app's first real SSE consumer.
- **`roundStartIndex` must be an absolute index into the full `messages` array** (the index of the
  current round's first message). `sendMessage` sends `messages.slice(roundStartIndex)` as history.
  `continueRound()` captures `messages.length` *before* appending the new greeting. An earlier
  off-by-offset bug only worked on the first round switch;
  `tests/app/components/useGuessWhoNextController.test.ts` plays three consecutive switches.
- **Replay keeps each speaker's voice.** Every transcript message pins its round's avatar and
  gender; a message with no `audioFileUrl` (its TTS failed) is replayed via
  `packages/shared/src/replayAudio.ts`'s `findSpeakerVoiceConfig`, which recovers the speaker's
  cast `voiceConfig` from another message's audio URL before falling back to a bare regeneration
  (a fresh context-free cast once gave a male speaker a female voice). Web and mobile both use it.
- **"Back to Home" ends the run** (`quitGame()`); there is no separate Quit.
- **The classifier's bars** (`classifyGuess`): one specific candidate name is `"clear"`, even
  phrased as a question or hedged ("is it X?", "maybe X or something?"), because bouncing it back
  made the game feel unresponsive. Two or more names with no stated pick is `"ambiguous"`, but an
  explicit commitment ("I'm going with X") wins over floated extras, and once the character has
  asked for a single name the classifier takes the most committed (else last) one rather than
  asking again. `AMBIGUOUS_GUESS_NOTE` never lets the character say or imply whether a name is
  right and never mentions judges or a system (an earlier version leaked the verdict, so a round
  was answered yet never scored, and "a separate system judges guesses" in the persona prompt made
  characters talk about "the judges"). An earlier version bounced "Edward" vs "Edmund Ironside"
  for eight turns, found only via real session logs decoded from `/api/audio?...&text=`. `"correct"` demands the *same individual*: leniency
  covers only surface forms (short/full names, nicknames, genuine aliases, spelling/localization,
  title-names of the same person), never related people (Hamlet vs Laertes), a shared trait or
  epithet (Beauty vs Cleopatra), or cross-tradition counterparts (Venus vs Aphrodite, Ares/Mars,
  Zeus/Jupiter). Default `correct: false` when unsure. If it regresses, expect a *wrong* guess
  scored as a win; check for that before loosening the prompt.
- **A miss on the round's first message is free, once.** `message.ts` spends the token's signed
  `freeMissUsed` flag instead of `wrongGuessCount`, so exploratory opening guesses don't end a run
  after one clue. The flag, not the client's history length, bounds it (an empty history can't
  farm free misses). Client copy ("one wrong guess is OK") is still accurate; the warm-up is a bonus.
- **Hidden-name guard.** `getGameReply`/`getOpeningReply` take the hidden name; a reply that says
  it unprompted (the player's own message didn't) is regenerated once, then replaced with a neutral
  line. A real Guess Who opening once began "Bagheera... ah, but you must discover that".
- **Persona is grounded by a qualified name.** `generateGuessWhoSelfCluePersonaPrompt` and
  `generateGameCluePersonaPrompt` generate the base persona from `Name (work)`, since appending the
  work fact afterward lost to the bare name (a bare "Pluto" played Disney's dog while the answer was
  the Roman god). The name is now `Pluto (Roman mythology)` in the name and work lists. Base
  personas are memoized per warm instance (`gameBasePersona`, 500 entries, never the error
  fallback, which `generatePersonalityPrompt` flags with `fallback: true`).
- **Cost levers (keep them).** `classifyGuess` skips its Haiku call for a long message with no cue word and no capitalized name (short ones
  like "zeus" always classify). Verdict reactions use Haiku, and game replies cap at 220 tokens.
  **Prompt caching was tried and removed:** a game persona prefix is ~900 tokens, under the
  model's cache minimum (a live check showed 0 cache reads and writes), and chat's is no longer.
  Revisit only if a prompt grows past roughly 2k tokens, and verify with `usage.cache_read_input_tokens`.
- **Giving up via chat reuses the menu's confirmation dialog.** On `"giveUp"`, `message.ts` returns
  `{ giveUpRequested: true }` with no reply; the controller sets a flag and `GamePage.tsx` opens
  the same modal the hamburger's "Give Up" opens. Only on confirm does the client call `give-up.ts`.
  **Give-up is a pure token decode** (no Claude call): `{ revealedName, finalStreak, gameOver: true }`.
- **`GameInstructionsModal.tsx`** shows on first visit (gated by each game's
  `instructions-seen` key) and from the menu. Its copy is accuracy-critical: guesses are typed into
  the same chat box; there is no separate guess control.
- **Curated names.** The game draws from `src/data/gameCharacterNames.ts` (~400 well-known names),
  not the full `characterNames.ts` (~1000, deliberately broad because `/random-character` shows the
  name up front). A hidden obscure figure makes a round unwinnable. Every entry is copied verbatim
  from `characterNames.ts` (`tests/src/data/gameCharacterNames.test.ts` pins this).
  `pickRandomCharacterName.ts` takes an optional `pool` (default: the full list).
- **`src/data/gameCharacterWork.ts`** gives every game name an authored source-work/tradition
  fact (`Record<string, string>` keyed by exact name). `round.ts` threads it into
  `generateGameCluePersonaPrompt` ("you are specifically drawn from: …") and `classifyGuess`'s
  "Hidden character" line, anchoring clues and judgments in the real individual instead of Claude's
  default association for a bare string. `tests/src/data/gameCharacterWork.test.ts` enforces
  completeness both ways. This was the structural fix after disambiguation bugs kept recurring
  (Scarecrow, Tin Man, Cowardly Lion, Hero, Beauty, David Copperfield, The Emperor, The Knight, The
  Monster).
- **Curated-list caveat: `characterNames.ts` is trusted blindly** (neither the game nor Random calls
  `validate-character`, and `round.ts` hardcodes `recognized: true`), and the allowlist also
  short-circuits validation for its names. A bare or ambiguous entry therefore becomes a public,
  cached "recognized" character. Treat any new bare title/role/quality word (with or without a
  leading article) as suspect: disambiguate with a parenthetical work, matching `"Cleopatra (Greek
  mythology)"`. `tests/src/data/characterNames.test.ts` denylists known bare archetypes (leading
  `the`/`a`/`an` stripped) as a secondary backstop.
- **A disambiguation qualifier is identity, not display.** `"David Copperfield (Charles Dickens
  novel)"` keeps its qualifier everywhere it acts as data: the token, every prompt, the
  `avatar_cache` key, `bots.name`, and launch names. Only rendering strips it, via
  `displayCharacterName()` (`packages/shared/src/validation.ts`), which both apps call wherever a
  name is shown (headers, message labels, Wall/carousel captions, Past chats, reveal copy,
  `transcript.ts`). Any new UI surface showing a character name should call it.
- **Rate limits (per IP/min):** `game-start` 10, `game-continue` 10 (both sized for in-process
  persona+avatar cost, the only ceiling on it), `game-message` 10, `game-give-up` 10,
  `game-high-score` 20.
- **Won't do: streaming ordinary per-turn game replies.** `chat.ts` has a `stream: true` mode but no
  client renders a live typing effect anywhere; if wanted, start with ordinary chat's UI.
- Not mechanically verifiable: whether a real guess is judged fairly and whether clue difficulty
  holds up are ongoing manual-QA and prompt-iteration concerns.

### Game simulator (`npm run sim:games`)

`scripts/simulate-games.ts` plays both games in-process with an LLM player (`--player strong|weak|adversarial`,
`--game`, `--concurrency`, `--max-turns`; **hard-limited to one round per game, concurrency 2, 6 turns by default (10 max), and it refuses to run unless a human sets `ALLOW_PAID_SIM=1`**; the local `.claude/settings.local.json` also denies Claude Code from launching it) and reports
win rate, pacing, wasted turns (an "ambiguous" the player had to repeat), name leaks, and
fourth-wall mentions, writing transcripts to gitignored `sim-output/`. It skips avatar, voice, TTS,
and the DB. **It costs real Anthropic money:** each turn is three or four calls and ~400 rounds
cost enough that the user stopped the work (~230 rounds yielded three real bugs, a leak, a two-name
win and a persona mismatch; most of the spend only confirmed prior findings). Read prompts and scan
name lists first; use real-player data (`analytics_events`, `/admin`) for difficulty questions, since
an LLM player knows far more than a human; one round per game is the cap, and Claude must not run it unprompted. `NODE_ENV=production`
makes chat replies use Sonnet like prod (the classifier is Haiku either way). Findings so far: all
players mostly win and the strong player wins in 2 to 3 turns, so difficulty is the open question.

### Guess Who (self-describing chat game)

`/guess-who` is the default game wherever both appear. The player chats with a mystery character
that never reveals its name and drops escalating real clues about itself. One wrong guess per
round is tolerated; a second ends the run. `generateGuessWhoSelfCluePersonaPrompt(name, work?)`
(`serverConfig.ts`) is the inverse of `generateGameCluePersonaPrompt`: first person, never names
itself, escalates from a broad self-description to specific checkable facts within a couple of
exchanges, grounded in `gameCharacterWork.ts`. Its opening uses `SELF_CLUE_OPENING_INSTRUCTION`
(`gameReply.ts`), never the default "introduce yourself" line (which gave the name away). Scores use
the `guess_who_*` tables; `/leaderboard` shows both top tens as tabs.

### Guess Who's Next (conversation game)

The player chats with a real, NAMED, shown character who talks as itself but steers toward a
*different, hidden* figure. **Don't invert this:** the character you chat with is never the
mystery, and there is no separate guess control; the server classifies every typed message as
`"clear"` guess, `"ambiguous"` (the character asks in character to confirm), `"giveUp"`, or
`"none"` (ordinary question). One wrong guess per hidden target is tolerated; a second ends the
run, or the player gives up (menu or typed) and is always told the answer. A correct guess reveals
the target and holds on "Continue," after which **the revealed figure becomes the new chat partner**
and steers toward a fresh hidden target, building a streak. TTS plays for every reply.

- **`generateGameCluePersonaPrompt(currentCharacterName, nextCharacterName)`** (`serverConfig.ts`)
  reuses `generatePersonalityPrompt` for the speaker and appends rules: steer toward the target
  without naming it; never claim not to know it or refuse it as being from another time/place (the
  pool spans eras and universes); the opening greeting includes one real, narrowing category-level
  fact ("a queen from ancient Egypt"), not pure mood; follow-ups escalate to a specific checkable
  fact within a couple of exchanges. This was deliberately made easier (issue #878, "game is too
  hard"): a contentless hint reads as stalling, and the prompt favors players finishing with long
  streaks over unsolvable rounds.
- **`start.ts`** picks both names, builds persona + avatar + voice, and returns the greeting (with
  audio), the token, and `currentCharacterName`. **`message.ts`** verifies the token, classifies
  (a Haiku classifier that also judges correctness when `"clear"`), then replies normally, asks for
  confirmation, tolerates-once-then-ends on a second wrong guess, or returns the reaction and new
  streak on a correct one.
- **Personal high score:** `guess_who_next_high_scores` (`(user_id, environment)` PK) holds a
  signed-in user's best streak. `updateHighScoreIfBeaten` runs fire-and-forget from `message.ts`'s
  correct branch (a Postgres upsert with a `setWhere` guard `highScore < newStreak`, so a racing
  write can't lower it); it fires once at judgment time, not on Continue. `GET .../high-score`
  returns `{ highScore: null }` with no DB (a guest gets its cookie-bound best from
  `guess_who_next_results`); `useGameController.ts` fetches it once on sign-in and bumps it
  optimistically with `Math.max`, so "Best: N" shows for guests too. **A new table needs `db:push`
  before it works live;** `db:check` treats a wholly-missing table as not-a-drift, so it's easy to
  forget.
- **Public leaderboard:** `guess_who_next_results` has one row per run (`id` = the token's `runId`,
  exactly one of `user_id`/`guest_id`, `environment`-scoped, `bestStreak` raised only via a guarded
  upsert). A guest's identity is a random 32-byte token in the HTTP-only `portrayal-game-guest`
  cookie, SHA-256-hashed before storage (`gameGuestIdentity.ts`; `ensureGuestId` mints at start,
  `getGuestId` only reads). `recordGameResult` runs on the correct branch for signed-in and guest
  runs, only when the token's issuance (`issuedForUserId`/`issuedForGuestId` plus `environment`)
  still matches the caller, so a copied token can't credit anyone. `getLeaderboard` ranks account
  bests plus per-guest bests together (private scores count for ranking only) and publishes only
  the opted-in top ten, one entry per account/guest. Opting in goes through
  `GET`/`POST .../leaderboard-settings`: top-ten eligibility is rechecked server-side and the name
  passes `checkLeaderboardName` (length/script rules plus a Claude moderation call that fails closed
  to `unavailable`). A player can change their public name anytime.
- **Analytics** (`analyticsEvents`): `game_started`, `game_guess_correct`, `game_guess_wrong` (both
  carry `turn`, the round's exchange number, which `/admin` averages as "turns to solve"),
  `game_round_continued`, `game_run_ended` (reason `second_wrong` or `give_up`); see "Internal
  analytics".

### Internal analytics (`/admin`)

Vercel Analytics/Speed Insights (`layout.tsx`) cover cookie-free page views and performance.
Production Google traffic analytics use the public GA4 stream `G-W01K2YSWH4`
(`NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` overrides it or enables the flow in development); the built-in ID
applies only when `VERCEL_ENV === "production"`, so previews and a local `next start` never report
into the live stream. `GoogleAnalyticsConsent.tsx` validates the ID shape and loads
`@next/third-parties` only after the visitor opts in. The choice is stored under
`STORAGE_KEYS.googleAnalyticsConsent`, synced across tabs, and editable on `/privacy`; opting out
also sets `ga-disable-<id>` and pushes a Consent Mode denial. Google Tag Manager was removed
2026-09-24 as unused; if re-added, don't publish a GA4 tag for this ID in it (double counting) and
don't server-render its `<noscript>` iframe (contacts Google without consent). CSP still allows
`googletagmanager.com` because `gtag.js` is served from there. The database layer below is separate
product-usage analytics, kept small rather than becoming general observability.

- **`analytics_events`** is an append-only log (`name`, `environment`, nullable `userId` where null
  means guest, `metadata` jsonb). It exists because guest usage never touches `bots`/`messages`.
  `recordEvent()` (`src/utils/analytics.ts`) is fire-and-forget and no-ops without `DATABASE_URL`.
- **Events** (low-frequency, high-signal, only after success): `character_validated`,
  `avatar_generated` (provider: `cache` | `cloudflare` | `pollinations` | `none`), `bot_created`,
  and the game events above. No event records character names, guesses, or chat text, preserving
  `skipPersistence`'s no-trace guarantee.
- **`GET /api/admin/stats`** aggregates the current environment: game starts (today/7d/all time),
  guest share, scored guess accuracy, continued rounds, ending reasons, streak distribution, and 90
  days of daily activity. `/admin` has keyboard-operable tabs (Guessing game, Character
  conversations); both daily charts use `AdminActivityChart`, whose 7/30/90-day range changes only
  the chart and its table (other figures are all-time except the labeled today/7d counts). Figures
  start when instrumentation deployed (no backfill: tokens hold no history, and abandoned runs emit
  no event). Writes are best effort, so counts can include retries and aren't a unique-run ledger.
- **Access:** `/admin` (`src/app/admin/page.tsx`) and `/admin/moderation` are unlinked-but-reachable
  and use the shared `AppHeader`/`useAccountMenu`. `src/utils/isAdmin.ts` admits a signed-in session
  whose email is in `ADMIN_EMAILS` (comma-separated) and **fails closed** (no list, no admins), the
  opposite default of other optional features because it grants read access to aggregate activity.
  Pages 404 a non-admin (`notFound()` via `isAdminSession()`) rather than rendering a shell.
  **Never honored on a Vercel Preview deployment,** since the stub provider signs in any typed
  email unverified; `isAdmin()` checks `VERCEL_ENV === "preview"` first. The API returns 401 with
  no session and 403 when not listed, before any DB query; the page's `useSession()` check is UX
  only. `GET /api/admin/is-admin` (DB-free, 30/min, always `200 { isAdmin }`, not a security
  boundary) drives the menu's Admin links, called only while authenticated.

## Conventions

### Prompt engineering conventions

Apply to any *new or edited* system prompt (not a mandate to rewrite existing ones).

- **`"text-simple"` (always Haiku) is the tier most sensitive to prompt quality** (`classifyGuess`,
  `validate-character.ts`, voice config, avatar prompts). Tighten the prompt with the techniques
  below before ever moving a call to a larger tier for accuracy.
- **Few-shot examples are the highest-leverage fix for a wrong judgment call.** Use 3-5 diverse,
  adversarial `<example>` blocks inside one `<examples>` tag, covering the near-misses that
  actually broke in production (see `classifyGuess`'s Edward/Edmund, Hamlet/Laertes,
  Beauty/Cleopatra, Venus/Aphrodite), not just the easy case.
- **Structure multi-part prompts with XML tags** (`<character_persona>`, `<examples>`, ...) so
  instructions, context, and untrusted input are unambiguous.
- **For a structured-JSON judgment call, put an explanation field before the decision field**
  (`{"reasoning": ..., "status": ..., "correct": ...}`): a cheap embedded chain-of-thought.
- **Prefer saying what *to* do, and add a one-line "why" behind non-obvious constraints.**
- **Known gap:** Anthropic now prefers tool-use/Structured Outputs over "return ONLY JSON" plus
  regex extraction (`src/utils/parseClaudeJson.ts`'s `extractJson`). Not migrated (no production
  bug yet); reach for it if a *new* structured call proves flaky rather than adding another
  parsing workaround.
- **Ordinary character dialogue never uses an em dash (—).** Every in-character system prompt
  (`chat.ts` replies and all of `src/utils/gameReply.ts`) appends `FORMATTING: Never use an em
  dash (—) anywhere in your reply. Use a comma, period, colon, or parentheses instead.` Stated as
  an explicit negative because Claude's prose defaults lean on em dashes and no positive phrasing
  suppresses them reliably. Not applied to `"text-simple"` classification prompts.

### Logging standards

All server routes use structured logging, ESLint-enforced.

- **Every log line is `logEvent(level, event, message, meta)`** (`src/utils/logger.ts`), never a raw
  `logger.info/.warn/.error(string, meta)` or bare `console.*`. The `event` field makes logs
  greppable and alertable by kind.
- **Event names are `snake_case`, prefixed by route or domain:** `chat_*`, `audio_*`, `avatar_*`,
  `bots_*`, `messages_*`, `chars_*`, `admin_stats_*`, `transcript_*`, `log_api_*`, `health_*`,
  `rate_limit_exceeded`. Exception: `auth_error`/`auth_warning` carry NextAuth's own code in
  `meta.code`, since those codes aren't this app's to rename.
- **Levels:** `info` for expected lifecycle events (a reply sent, a cache hit, a routine 400);
  `warn` for recoverable or security-relevant events (a tripped rate limit, a non-admin hitting
  `/api/admin/stats`, a text/audio mismatch); `error` for real failures (a 500, discarded work, a
  broken downstream call).
- **Wrap `meta` in `sanitizeLogMeta()`** (truncates long strings, flattens nested objects). Never log
  full user-authored content (messages, replies, personality prompts, cache keys built from them) on a
  routine path; log lengths, hashes, or ids (see `chat_reply_sent`/`chat_cache_hit`). A short
  truncated snippet is acceptable only on a rare, bounded diagnostic path (`audio_text_mismatch_regen`).
- **One `logEvent` per failure,** not an `error`/`warn` pair. The one deliberate exception is
  `health.ts`: its `error` detail is gated behind `NODE_ENV !== "production"` while an unconditional
  lower-detail `info` always fires, because the endpoint is hit on every chat mount and transient
  provider blips shouldn't drive alerting. Don't collapse it without re-reading why.
- **Centralize cross-cutting logging:** 429 logging lives once in `applyRateLimit`
  (`src/utils/rateLimit.ts`), tagged with the limiter's `name`.
- **Enforcement:** `no-console` (scoped to `src/**`, excluding `logger.ts` and tests) plus a
  `no-restricted-syntax` rule banning `logger.info(`/`.warn(`/`.error(` in `src/pages/api/**/*.ts`.
  Client code (`src/app/components`) already uses `logEvent` exclusively; keep it that way.
- **Not mechanically enforced:** whether a *new* failure path should log at all is a judgment call,
  as is whether this file or the README needs updating. Review both deliberately before opening a PR
  (the PR template's checklist exists for this); a green `npm run ci` doesn't check either.

### Code documentation standard

A separate layer from inline "why" comments (default to none; add one only when the reasoning is
non-obvious): a one-line `/** ... */` JSDoc summary on every top-level exported function, React
component, and hook.

- **Required:** a real summary sentence placed immediately above the declaration (a blank line or
  statement between breaks the association). Not required: exhaustive `@param`/`@returns` prose
  (signatures already say it); add tags only when they carry a non-obvious contract.
- **Enforced** by `eslint.config.cjs`'s `eslint-plugin-jsdoc` block, scoped to
  `src/app/components/**/*.{ts,tsx}`, `src/**/*.ts`, and `src/pages/api/**/*.ts` (tests and `.d.ts`
  excluded). `jsdoc/require-jsdoc` matches by AST position (`Program > ...`), so both `export const
  Foo = () => {}` and `const Foo = () => {}; export default Foo` are covered, and
  `flat/recommended-typescript-flavor` validates syntax wherever a block exists. `@swagger` and
  `@google-cloud` are allowed via `check-tag-names`' `definedTags`. A missing or malformed block fails
  `npm run ci` (`--max-warnings=0`).
- **Exported** by `npm run docs:code` (TypeDoc, `config/typedoc.mjs`) to gitignored `docs-generated/`,
  also a `ci` step and a workflow step (a second check on the same comments). `blockTags` is TypeDoc's
  `OptionDefaults.blockTags` plus `@swagger`; the two tools keep separate tag allowlists.
- **Nested helpers and callbacks don't need blocks** (only top-level declarations; `eslint-plugin-jsdoc`
  additionally requires one on any nested `function`-keyword declaration, but arrow helpers are
  exempt). Don't document every inner helper.

### API documentation

Every `src/pages/api/*.ts` handler carries an OpenAPI 3.0 `@swagger` JSDoc block.
`npm run docs:api` (`scripts/generate-openapi.cjs`, via `swagger-jsdoc`) writes
`public/openapi.json` (a gitignored build artifact; never hand-edit) and runs automatically before
`dev`/`build`/`vercel-build`. `src/app/reference/route.ts` serves the interactive UI
(`@scalar/nextjs-api-reference`) at `/reference` from that static file, since Vercel's bundler
doesn't reliably ship raw `.ts`; it sits outside `src/pages/api`, so `proxy.ts` auth doesn't apply.
The glob is recursive (`src/pages/api/**/*.ts`) so nested directories like `admin/` are picked up,
and the script normalizes to forward slashes because `swagger-jsdoc` doesn't match backslash paths
(if `docs:api` reports 0 documented paths locally on Windows, suspect this).

### Testing conventions

- **E2E smoke (`e2e/`, `playwright.config.ts`)** runs a few synthetics (key pages render with no
  page errors, the random button works, 404s) against a production build on port 3100, inside the
  `build` job in `ci.yml` (reusing that build; Chromium installs in parallel with it). **It must never spend Claude/Google/image tokens:** the server gets a dummy
  `ANTHROPIC_API_KEY`, and `smoke.spec.ts` throws on any request matching `BILLED_API`. Extend it
  only with synthetics that stay off those routes (stub them with `page.route` if a flow needs them).

- Tests live under `tests/`, mirroring source (`tests/api`, `tests/app`, `tests/pages`, `tests/src`,
  `tests/utils`, `tests/integration`, `tests/unit`).
- Mock `authenticatedFetch`, not raw `fetch`, for client/server interaction tests, and mock external
  APIs (Anthropic, GCP TTS/Vertex) rather than calling them live.
- TTS tests must call `tts.__resetSingletonsForTest()` to avoid leaking singleton state.
- For code reading an SSE (`stream: true`) response via `response.body.getReader()` (the games'
  `fetchRoundWithProgress`, `chat.ts`'s streaming mode), use `tests/helpers/mockResponse.ts`'s
  `mockSseResponse` (all frames queued) or `mockControlledSseResponse` (frames pushed one at a time,
  to assert state *between* events such as a staged-progress label). A plain `mockResponse()` has no
  `.body` and hangs or fails.

## Security posture

Kept high-level (this file is public): what changed and why, not exploit-level specifics.

- **`proxy.ts`'s Origin/Referer check is CSRF protection, not authentication.** It stops a malicious
  site's browser JS from riding a visitor's session, but a non-browser client can set any `Origin`.
  Don't treat an allowed-origin match as proof of a trusted caller when reasoning about request
  volume or cost; the per-route rate limiter (`src/utils/rateLimit.ts`) is the real ceiling. Fully
  closing this would mean requiring login on guest-usable routes (breaking core UX) or real
  session/token infrastructure, an accepted tradeoff.
- **API key comparison is constant-time** (`secureCompare`, hash-then-`timingSafeEqual`), since Proxy
  defaults to the Node.js runtime in Next.js 16 (renamed from `middleware.ts`, which was Edge).
- **`getClientIp()`** trusts the first `x-forwarded-for` entry, correct on Vercel (its edge
  overwrites the header). Revisit if self-hosted behind another proxy (prefer `@vercel/functions`'
  `ipAddress()`).
- **`/api/health` is rate-limited (10/min/IP) and returns no raw third-party SDK error text** (still
  logged server-side); it makes two real billed or quota-limited calls per request.
- **`buildSsml()`** (`src/utils/voiceHelpers.ts`) XML-escapes `text` before interpolating into SSML
  (also fixes malformed SSML from ordinary `&`/`<`). `/api/audio`'s `text` param is capped at 2000
  characters. Letting the client supply the text is intentional: audio isn't persisted server-side,
  so regenerating after eviction needs the original text.
- **`scripts/scan-secrets.sh`** matches this app's credential shapes (Anthropic keys, Google OAuth
  secrets, Postgres URLs, Vercel Blob tokens), not just PEM blocks; `.env.example` is excluded
  (placeholders look like credentials by design).
- **`.github/workflows/semgrep.yml`** runs the JavaScript, TypeScript, React, and Node.js community
  rulesets on pushes to `main` and PRs (token-free `semgrep scan`, metrics off); reviewed false
  positives carry narrow `nosemgrep` annotations with reasons.
- **`eslint-plugin-regexp`** runs `no-super-linear-backtracking` and `no-super-linear-move` as
  errors in `npm run lint`, catching ReDoS-shaped patterns locally.
- **`.github/workflows/ci.yml` uses `npm ci`,** not `npm install`/`update`, for reproducible builds.
- **`next.config.mjs`** sends explicit `Strict-Transport-Security` alongside the CSP,
  `X-Frame-Options`, and `Permissions-Policy` headers.
- **Anyone integrating with the API key** gets the current `API_SECRET` from `.env.local`/Vercel.

## Mobile app (`apps/mobile`)

Android/iOS Expo client for this same backend (folded into the monorepo in v0.6.1 with history
preserved; the old standalone mobile/shared repos are deleted). It is a pure API client: no
server code lives in it, and it must never reimplement backend logic, only call it. It still
deploys independently of the web app (Expo/EAS, not Vercel). Read the versioned Expo docs
(<https://docs.expo.dev/versions/v57.0.0/>) before writing mobile code; SDK 57 differs from
older Expo. Parity rules are in "Web/mobile parity" above. Mobile owns only its UI: screens
(`apps/mobile/src/screens/`: Creator, Chat, CharWall, History, Game, Leaderboard) and
components are written natively, never shared with the DOM app.

- **`packages/shared` (`character-chatbot-shared`) is the canonical home for anything
  cross-platform**, an npm workspace resolved locally (edit it and re-run type-check, no
  install step). It holds API types (`types.ts`, mirroring the `@swagger` blocks), validation,
  storage keys, brand theme/copy, game and leaderboard state machines, character-creation flow,
  category taxonomy, and `formatRelativeTime`. Colors are authored once in
  `packages/shared/src/tokens/{light,dark}.json`; mobile flattens them and
  `scripts/generate-theme-css.cjs` feeds the same files to Style Dictionary for web's
  generated CSS.
- **Audio is `expo-audio`** (`useAudioPlayer` + `player.replace()`); `expo-av` is gone from SDK 57.
- **Stays on plain Expo Go, deliberately.** A custom dev client (`react-native-keyboard-controller` with
  prebuild) was tried for a keyboard bug and fully reverted once `insets.bottom` solved it.
  Don't adopt a native dependency without confirming Expo Go's module set truly can't do the job.
- **Chat is non-streaming** (React Native's `fetch` can't read an SSE body), so `/api/chat` and
  the game's `start`/`continue` run without `stream` and show a plain spinner. Game tokens are
  opaque in AsyncStorage; a guest's identity is a random SecureStore secret
  (`src/gameGuest.ts`) sent as `x-game-guest` in place of web's HttpOnly cookie. Correct and
  wrong guesses fire haptics (native-only extra).
- **Every non-GET request carries `x-api-key`** (`EXPO_PUBLIC_API_SECRET`), because React
  Native sends no `Origin`/`Referer` and so lands in `proxy.ts`'s external-origin branch. The
  secret is extractable from the APK; the per-route rate limiter is the real abuse ceiling
  (same caveat as "Security posture"). A documented tradeoff, not an oversight: discuss before
  changing. Env vars: `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_SECRET` (`.env.example`).
- **Sign-in is a backend-mediated browser bridge**, since Auth.js's cookie session doesn't fit a
  mobile client and Expo Go has no native Google Sign-In. `src/auth.ts`'s `signIn()` opens
  `GET /api/auth/mobile-auth-start?redirect_uri=...` via `expo-web-browser`
  (`app.json`'s scheme `character-chatbot-mobile`), which lands on the backend's own
  `/auth/signin` page (Google or email). NextAuth's ordinary callbacks finish, then
  `mobile-auth-complete.ts` mints a bearer JWT (same shape as the web cookie; `getSessionUserId`
  reads either) back into the app. The token lives in memory and `expo-secure-store`
  (`src/authToken.ts`, split from `auth.ts` to avoid a cycle with `api.ts`) and is attached as
  `Authorization: Bearer`. `GET /api/auth/mobile-session` resolves it to `{ email, name }`.
  **Email-path limitation:** it only auto-completes if the magic link is tapped on the same
  device; elsewhere the in-app browser tab just waits. A signed-in user's characters persist via
  `POST /api/bots` (fire-and-forget), `HistoryScreen` lists them, and `ChatScreen` reconciles
  local history against `GET /api/messages` (adopt the server list only if longer), matching web.
- **Headers:** `AccountHeaderButton` is every screen's default `headerRight` (set in
  `App.tsx`'s `screenOptions` with `DarkModeButton`), so sign-in, name, and Past chats are
  reachable everywhere. It takes `navigation` as a prop, and lives in `headerRight` because
  overriding `headerLeft` would replace native-stack's back button.
- **Navigate with `navigation.navigate`, not `replace`,** from Creator/CharWall into Chat;
  replacing left Chat with no back button.
- **`CreatorScreen` must fit one screen with no scrolling** on modern Android phones (checked at
  360x740 through 412x915 with a resume card showing). The carousel is the flexible element:
  it is sized (110 to 210) from the measured leftover room, and the viewport keeps the tallest
  height seen so the keyboard doesn't shrink it. Don't give the scroll container `flexGrow: 1`.
  Anything tall added here needs re-checking via Expo web plus Playwright with `/api/chars` stubbed.
- **Keyboard avoidance in `ChatScreen`** uses `KeyboardAvoidingView` with `behavior="padding"` and
  `keyboardVerticalOffset={useHeaderHeight()}` (SDK 57's forced edge-to-edge disables
  `adjustResize`), and drops the input row's `insets.bottom` padding while the keyboard is open
  (it otherwise doubled up on a real Samsung). For a bug that reproduces on one device only, add a
  temporary on-screen debug readout of real device values before changing the mechanism blind.
- **Shared hand-drawn SVG icon glyphs were tried and reverted** (the send button rendered blank
  on a real Android device and stayed broken). Icons are `@expo/vector-icons` (Ionicons). If
  revisited, validate on a real Android device, not the web preview.
- **Branding** reuses the web favicon (`public/palette-icon.svg`): `assets/icon.png`,
  `splash-icon.png`, and the `android-icon-*` set are rendered from it (regenerate if it changes).
- **Web preview (`npx expo start --web`) is dev-only,** for layout and navigation; real network
  calls hit `proxy.ts`'s CORS wall by design.
- **No voice input on mobile** (declined 2026-09-27; see "Voice input" above).
- **Still to do for store release:** privacy policy listing (can point at the web site), Play
  Console listing, EAS signing config, internal testing track.

### Mobile testing, lint and CI

Jest (`jest-expo`) plus React Native Testing Library, tests under `apps/mobile/tests/` mirroring
`src/`, with the same 80% global coverage threshold. Its `npm run ci` (`lint --max-warnings=0`,
`lint:md`, `format:check`, `type-check`, `test:coverage`) runs from the root workflow
`.github/workflows/ci-mobile.yml` and inside the root `npm run ci`, which also runs
`packages/shared`'s tests.

- **RNTL v14's `render` and `fireEvent` are async;** always `await` both.
- **Wrap an async handler before `onPress`** (`() => void run()`), or a test that pauses a mocked
  request mid-flow hangs until Jest's timeout.
- **Screen tests render `navigation.setOptions`'s header in the same tree** via a harness with a
  memoized `navigation` object (see `ChatScreen.test.tsx`); an unmemoized one loops the effect.
- **Workspace hoisting** is handled in `jest.config.js` (`moduleNameMapper` forces one `react`;
  `moduleDirectories` finds native deps installed only under `apps/mobile`). `jest.setup.js` owns
  the native/global mocks (AsyncStorage, SecureStore, expo-audio, vector icons); a dependency bump
  can move a mock's path, so check there first.
- **ESLint** (`eslint-config-expo`) disables `react/no-unescaped-entities` and `react-hooks/refs`
  (false positives for RN; see `eslint.config.js`). `settings.react.version` is pinned, not
  `"detect"`, because ESLint 10 removed an API `eslint-plugin-react@7.37.5` calls during
  detection; **bump it by hand whenever mobile's `react` version changes.** Prettier and
  markdownlint configs deliberately mirror the root's.
- Audio playback, keyboard/scroll layout, and the real sign-in handoff can only be verified on a device.

## Environment variables

**Required:** `ANTHROPIC_API_KEY`, `API_SECRET` (checked by `proxy.ts`),
`GOOGLE_APPLICATION_CREDENTIALS_JSON` (inline service-account JSON, for TTS; in `.env.local` keep it on one line in single quotes, since dotenv expands escapes in double quotes and corrupts the private key).

**Optional** (each degrades gracefully when unset; the app is fully functional as a guest with none):

- `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`: overrides the production site's built-in GA4 stream or enables
  the consent-gated flow in development (see "Internal analytics").
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`: Cloudflare Workers AI as the primary avatar
  provider; without them Pollinations.ai runs with no config (see "Avatar generation").
- `VERCEL_BLOB_READ_WRITE_TOKEN` / `BLOB_READ_WRITE_TOKEN`: Vercel Blob logging and durable avatar URLs.
- `TTS_TMP_DIR`: defaults to the system temp dir.
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`):
  share rate-limit counters across instances.
- `DATABASE_URL` + `NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`: account sign-in
  and persistence (see "Account persistence").
- `EMAIL_SERVER` + `EMAIL_FROM`: passwordless magic-link sign-in alongside Google (needs `DATABASE_URL`).
- `GAME_TOKEN_SECRET`: key for the games' encrypted round token; falls back to `NEXTAUTH_SECRET`, then
  the required `API_SECRET`, so the games need no new configuration.
- `ADMIN_EMAILS`: comma-separated allowlist for `/admin`; fails closed when unset.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
