# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm install              # install deps (also runs scripts/fix-express-tsconfig.cjs via postinstall)
npm run dev               # next dev --turbopack
npm run build              # production build
npm run lint                # eslint . --ext .js,.jsx,.ts,.tsx
npm run lint:fix
npm run lint:md              # markdownlint over **/*.md
npm run type-check            # tsc --noEmit
npm run test                   # jest
npm run test:watch
npm run test:coverage           # jest --coverage (enforces 80% global threshold — see jest.config.cjs)
npm run analyze                  # ANALYZE=true next build (bundle analysis)
npm run docs:api                  # regenerate public/openapi.json from @swagger JSDoc comments; runs automatically before dev/build
npm run ci                        # lint --max-warnings=0 && lint:md && type-check && test:coverage && build — run this before considering work done
```

Run a single test file: `npx jest tests/api/chat.test.ts`
Run tests matching a name: `npx jest -t "some test description"`

Coverage is enforced globally at 80% (branches/functions/lines/statements) in `jest.config.cjs` — `npm run test:coverage` fails the build if it drops below that.

## Architecture

Next.js 16 (Pages Router API + App Router UI) app. UI in `app/`, API routes in `pages/api/` (deliberately Pages Router, not App Router route handlers — server handlers are authoritative here).

### Request flow

`app/components/useChatController.ts` → `authenticatedFetch()` (`src/utils/api.ts`) → `pages/api/chat.ts`. Every client→server call should go through `authenticatedFetch`, not raw `fetch`, so it passes through `proxy.ts` auth and so tests can mock it consistently.

`proxy.ts` is the single choke point for API auth: it validates request origin (localhost, Vercel production/preview auto-pass) and enforces `x-api-key` == `API_SECRET` for external origins. Adding a new deployment domain means updating `allowedHosts` in `proxy.ts` — nowhere else. Host matching is exact (never prefix or substring), and a request with no `Origin`/`Referer` only passes on a safe method (GET/HEAD/OPTIONS) from a first-party host — everything else needs the API key. `tests/proxy.test.ts` pins both directions.

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

**Overriding a warning/caution never persists anything server-side.** `useBotCreation.ts` captures whether the run reached `handleCreate` via `handleValidationContinue` (i.e. the user clicked "Continue Anyway") into a `skipPersistence` flag that rides along on the `Bot` object itself, all the way through: `POST /api/generate-avatar` gets `{ skipPersistence: true }` and, when set, never reads or writes the shared `avatar_cache` table and never uploads to Vercel Blob (returns the raw base64 data URL instead of a durable link) — see `pages/api/generate-avatar.ts`'s `bypassPersistence`. `app/index.tsx`'s `handleBotCreated` checks `bot.skipPersistence` before its usual fire-and-forget `POST /api/bots`, so the character never lands in that signed-in user's own `bots` row either — it behaves exactly like a guest's character for that session (localStorage only). `ChatHeader.tsx` also hides the Download Transcript button for such a bot, so no durable artifact of the session leaves the app. `CopyrightWarningModal.tsx`'s disclaimer text tells the user this up front. None of this touches personality or voice generation — those were never cached/persisted per-name to begin with.

### Avatar generation (`pages/api/generate-avatar.ts`)

Two-stage: Claude (`text-simple` tier) writes a detailed, SFW image-description prompt from the character name, then Gemini image generation on Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI; via the `@google/genai` SDK's `generateContent`, not the legacy Imagen `predict` API) renders a square PNG. If `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` is set, the image is uploaded to Vercel Blob (`avatars/<uuid>.<ext>`, public access) and a durable Blob URL is returned; otherwise (no token configured, e.g. local dev with no Blob store) it falls back to a base64 data URL, unchanged from prior behavior. Blob upload failures don't fail the request — they fall back to the data URL too. Requires the service account to have `roles/aiplatform.user` and `aiplatform.googleapis.com` enabled on `GOOGLE_CLOUD_PROJECT`. Rate-limited to 5 req/min/IP since image generation calls are comparatively expensive.

### Client-side storage

`src/utils/storage.ts` wraps `localStorage` with an in-memory fallback (used in tests). Known keys: `chatbot-bot`, `chatbot-history-<bot.name>`, `voiceConfig-<bot.name>` (versioned — use the versioned helpers in `storage.ts`, never write the shape directly), `audioEnabled`, `darkMode`, `bot-session-id`. Never store secrets or PII here; it's client-side only.

### Account persistence (in progress)

The app is migrating toward optional user accounts with server-persisted bots/chat history, staged as additive phases — guest (no account) usage must keep working unchanged throughout.

- **Phase 1 (done):** `pages/api/generate-avatar.ts` uploads generated avatars to Vercel Blob and returns a durable URL when `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` is configured; otherwise falls back to a base64 data URL (unchanged prior behavior).
- **Phase 2 (done):** Auth.js (`next-auth@4` — stable; v5/"Auth.js" is still beta and its simplified `auth()` helper is App-Router-only, which doesn't fit this repo's Pages-Router-authoritative API convention) with Google sign-in (Facebook added later, issue #832), JWT sessions (no `sessions` table). `src/auth/authOptions.ts` holds the config; `pages/api/auth/[...nextauth].ts` mounts it — this route intentionally lives in `pages/api` (unlike `/reference`) since Auth.js v4's Pages Router integration is a direct default-export handler, not an App Router route handler. `src/db/schema.ts` (Drizzle, Postgres via Neon) defines just `users`/`accounts` so far. `src/db/client.ts` exports `getDb()`, a lazily-constructed singleton — it must never connect at module import time, since `next build` bundles (but never executes) API route handlers, and constructing eagerly would break the build whenever `DATABASE_URL` is unset. The Drizzle adapter in `authOptions.ts` is likewise only attached when `DATABASE_URL` is set — same degrade-gracefully shape as the Blob token and the Upstash rate-limit store. Use `src/utils/getSessionUserId.ts` in any future Pages Router handler that needs to know the signed-in user — never trust a client-supplied user id, same trust boundary `proxy.ts` enforces for request origin. Schema changes are applied locally via `npm run db:push` (Drizzle Kit, not part of `npm run ci` since it mutates external state). `proxy.ts` bypasses its origin/API-key check entirely for `/api/auth/*` — Auth.js's own signed CSRF/state cookies secure those routes, and Google's OAuth callback arrives with Google's own Referer, which the origin check would otherwise reject. `next.config.mjs`'s CSP `form-action` explicitly allows each OAuth provider's consent-screen origin (`https://accounts.google.com`, `https://www.facebook.com`), since Chrome enforces `form-action` against a form submission's eventual redirect target, not just its immediate action URL — without it, the sign-in form's redirect to that provider is silently blocked with no visible error. Caught this exact gap a second time when Facebook was added (issue #832) — extend this list for any future provider. Real Google sign-in only works on the static production domain: Google's redirect URI matching has no wildcard support, so it can't follow Vercel preview deployments' per-push URLs. Preview (`VERCEL_ENV === "preview"`) swaps Google out entirely for a stub `Credentials` provider (`id: "preview-stub"`, in `authOptions.ts`) that issues an ephemeral, unverified, non-DB-backed session from just an email string — good enough to exercise signed-in UI on a preview deployment. Swapped, not added alongside: Google has no client_id configured on preview and would just fail with `SIGNIN_OAUTH_ERROR` if offered there too. Guarded twice (excluded from the `providers` array outside preview, and rechecked inside `authorize()` itself) so it can never activate outside an actual Vercel preview build.
- **Phase 3a (done):** Landing-page sign-in via `AuthControl` (`app/components/AuthControl.tsx`) — the chat header intentionally has no sign-in control; a guest mid-chat goes back to the landing page to sign in. Signs in directly against whichever provider is active (via `getProviders()`) rather than routing through Auth.js's picker page when there's only one; falls back to the picker now that a second real provider (Facebook, alongside Google) exists outside preview — see `authOptions.ts`. The signed-out button's icon reflects this: Google's icon only when Google is the single active provider (including the false-preview-stub edge case, which is single but not Google), a generic sign-in icon otherwise, since a click no longer goes straight to a specific provider. `SessionProvider` lives in its own `"use client"` wrapper (`app/components/Providers.tsx`) rather than being rendered inline from the Server Component root layout (`app/layout.tsx`) — inline breaks `next build`'s static prerender of `/`.
- **Phase 3b (done):** `bots` table (`src/db/schema.ts`) persists a signed-in user's created characters; `pages/api/bots.ts` exposes `POST` (upsert on create) and `GET` (list, most-recently-updated first), both gated on `getSessionUserId` and silently no-op (200, empty result) for guests or when `DATABASE_URL` isn't configured — never a 401, since accounts are additive. Wired into `app/index.tsx`'s `handleBotCreated`: fire-and-forget, `.catch()`-swallowed, so a persistence failure never breaks bot creation for a signed-in user (identical to how it already works for guests).
  - **Environment scoping, not separate databases:** one shared Neon database serves local dev, Preview, and Production — rows are walled off by an `environment` column (`bots.environment`, part of its `(user_id, name, environment)` unique constraint) rather than provisioning a Neon branch per environment. `src/utils/environment.ts`'s `getCurrentEnvironment()` resolves it from `VERCEL_ENV` (`"production"` | `"preview"`, set by Vercel itself, never client-controlled), falling back to `"development"` when unset (plain local `next dev`). Every `bots` query must filter on this — see `pages/api/bots.ts` for the pattern. Deliberately *not* applied to `users`/`accounts` (a signed-in identity is the same person regardless of which environment they're using) or `avatar_cache` (see below — intentionally global).
  - **`avatar_cache` (global, not environment-scoped):** `pages/api/generate-avatar.ts` checks this table (keyed by lowercased character name) before calling Claude+Gemini, and writes to it after a successful generation — Gemini image generation is comparatively expensive, so a name generated once is reused by every user, guest or signed-in, in every environment, going forward. This is a deliberate exception to environment-scoping: walling it off would reintroduce the cost problem it exists to solve. Only real generations are cached, never the `/silhouette.svg` fallback — caching a failure would permanently deny a name a real portrait past a transient outage. `gender` is cached alongside the image since it's produced by the same Claude prompt-generation step a cache hit skips entirely, and callers need it for voice selection. Cache reads/writes degrade gracefully (return null / no-op) with no `DATABASE_URL` or on any DB error — never fail the actual generation request.
  - **Resuming a saved character:** `ResumeBotDropdown` (`app/components/ResumeBotDropdown.tsx`) renders on the landing page, above the sign-in row, only for a signed-in user with at least one persisted character; each option is labeled with a friendly relative last-updated time (`formatRelativeTime` — "a few minutes ago", "yesterday", etc.). Selecting one calls the exact same `onBotCreated` callback `BotCreator` uses for a newly-created character, so there's no separate "load an existing bot" path to keep in sync. Only identity (name/personality/avatar/voice) is restored synchronously this way — chat history catches up separately via phase 3c below.
- **Phase 3c (done): `messages` table + server-persisted chat history.** For a signed-in user's saved character, `pages/api/chat.ts` becomes the source of truth for personality and message history instead of trusting the client's `personality`/`conversationHistory` on every request — same rationale as bot ownership in phase 3b. It looks up the caller's `bots` row by `(user_id, name, environment)` (the same unique index `pages/api/bots.ts` relies on); a guest, no `DATABASE_URL`, or a character never saved server-side (e.g. a copyright-warning override, which is never persisted at all — see the copyright-validation section above) all fall through to the exact prior client-authoritative behavior, unchanged.
  - **Rolling summarization checkpoint:** `bots.summary`/`summarizedThroughMessageId` (`src/db/schema.ts`) replace re-summarizing the full history from scratch every turn once it exceeds 20 messages. Each turn fetches only the `messages` rows after the checkpoint; if that unsummarized tail exceeds 20, the oldest excess is folded into a new summary via `summarizeConversation`'s new optional `priorSummary` param (`src/utils/conversationSummarizer.ts`) — which compounds the existing summary rather than discarding it — and the checkpoint advances to the last message folded in. Most turns touch the summarizer zero times, reusing the existing summary for free. Notably, the *client* already pre-trims `conversationHistory` to the last 20 messages before sending (`useChatController.ts`), so the original client-history-based summarization branch never actually fired in production — this DB-backed path is what makes summarization real.
  - **Write path:** after every response path (cache hit, streaming, non-streaming) sends its reply, `finalizeChatPersistence` fire-and-forget-inserts the user/bot message pair into `messages` and, if this turn advanced the checkpoint, updates `bots.summary`/`summarizedThroughMessageId` — best-effort, same resilience pattern as TTS and the avatar cache; a write failure is logged and never discards an already-generated reply. The intro message ("Introduce yourself...") goes through this same `/api/chat` path, so it's persisted with no special-casing.
  - **Read path:** `GET /api/messages?botName=<name>` (new, GET-only — messages are never written through a directly-callable endpoint) returns a signed-in user's chat history for one saved character, oldest-first, capped at 200. `useChatController.ts` seeds its `messages` state from local storage instantly on mount (unchanged, so perceived load time doesn't regress), then — only when signed in — fetches this endpoint in the background and adopts the server's list only if it's *longer* than what's already loaded (the new-device / cleared-storage case). Local storage stays the fast per-device cache; the server is the durable, multi-device source of truth.
  - Schema changes for this phase were applied via `npm run db:push` same as prior phases — remember to run it again after pulling `src/db/schema.ts` changes, since a mismatched live DB fails every `bots`/`messages` query with a missing-column/relation error (caught and logged, degrades to guest-like behavior — silent, easy to miss without checking server logs).
- **Tracking:** [GitHub issue #830](https://github.com/andylacroce/character-chatbot-generator/issues/830) covers the whole migration across all phases. Keep it current as work lands — check off a phase's checkbox in the issue body (`gh issue edit 830 --body-file <file>`) and post a short progress comment (`gh issue comment 830 --body "..."`) when a phase completes or a significant sub-step is verified working, not just at the very end.

### API documentation

Every `pages/api/*.ts` handler carries a `@swagger` JSDoc block (OpenAPI 3.0). `npm run docs:api` (`scripts/generate-openapi.cjs`, via `swagger-jsdoc`) reads those comments and writes `public/openapi.json` — a gitignored, build-time artifact, not something to hand-edit or commit. It runs automatically before `dev`/`build`/`vercel-build`; run it directly after touching a route's annotations. `app/reference/route.ts` serves the interactive UI (`@scalar/nextjs-api-reference`) at `/reference`, reading that same static file — deliberately not scanning route source at request time, since Vercel's serverless bundler doesn't reliably ship raw `.ts` alongside compiled output. The route lives outside `pages/api`, so it isn't subject to `proxy.ts` auth. `swagger-jsdoc`'s glob resolution doesn't match backslash-separated paths, so the script normalizes to forward slashes before passing them in — same class of Windows/POSIX path bug as elsewhere in this repo; keep that in mind if `docs:api` starts reporting 0 documented paths locally.

### Module system (do not regress)

`package.json` intentionally has no `"type": "module"` — removing it previously fixed a Vercel `ERR_REQUIRE_ESM` crash where Next's CJS serverless launcher couldn't `require()` compiled API route output. `next.config.mjs` uses an explicit `.mjs` extension instead so it's still treated as ESM. Source (TS, `import`/`export`) compiles fine either way via SWC — don't re-add `"type": "module"`.

## Environment variables

Required: `ANTHROPIC_API_KEY`, `API_SECRET` (checked by `proxy.ts`), `GOOGLE_APPLICATION_CREDENTIALS_JSON` (path or raw JSON), `GOOGLE_CLOUD_PROJECT`.
Optional: `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` (enables Vercel Blob logging and durable avatar URLs), `TTS_TMP_DIR` (defaults to system temp), `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) to share rate-limit counters across instances, `DATABASE_URL` + `NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (enables account sign-in and persistence — see "Account persistence" above; the app is fully functional as a guest with none of these set).

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
