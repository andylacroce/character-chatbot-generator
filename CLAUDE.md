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

The most complex endpoint: calls Claude, summarizes conversation history once it exceeds 50 messages (`src/utils/conversationSummarizer.ts`), streams via SSE when the client passes `{ stream: true }`, and does "smart continuation" — detects a truncated model response, appends a "Would you like me to continue?" prompt, and resumes seamlessly if the user says yes.

SSE frames are plain `data: JSON\n\n` — not a custom binary protocol. Final payload shape consumed by the client: `{ reply: string, audioFileUrl?: string, done: true }`. Changing that shape requires updating `useChatController.ts` and every test that parses stream frames.

If a reply requests TTS, the handler calls `src/utils/tts.ts` (`synthesizeSpeechToFile`), keyed by a stable `getAudioCacheKey` hash to avoid re-synthesizing identical audio.

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

### Avatar generation (`pages/api/generate-avatar.ts`)

Two-stage: Claude (`text-simple` tier) writes a detailed, SFW image-description prompt from the character name, then Gemini image generation on Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI; via the `@google/genai` SDK's `generateContent`, not the legacy Imagen `predict` API) renders a square PNG. If `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` is set, the image is uploaded to Vercel Blob (`avatars/<uuid>.<ext>`, public access) and a durable Blob URL is returned; otherwise (no token configured, e.g. local dev with no Blob store) it falls back to a base64 data URL, unchanged from prior behavior. Blob upload failures don't fail the request — they fall back to the data URL too. Requires the service account to have `roles/aiplatform.user` and `aiplatform.googleapis.com` enabled on `GOOGLE_CLOUD_PROJECT`. Rate-limited to 5 req/min/IP since image generation calls are comparatively expensive.

### Client-side storage

`src/utils/storage.ts` wraps `localStorage` with an in-memory fallback (used in tests). Known keys: `chatbot-bot`, `chatbot-history-<bot.name>`, `voiceConfig-<bot.name>` (versioned — use the versioned helpers in `storage.ts`, never write the shape directly), `audioEnabled`, `darkMode`, `bot-session-id`. Never store secrets or PII here; it's client-side only.

### Account persistence (in progress)

The app is migrating toward optional user accounts with server-persisted bots/chat history, staged as additive phases — guest (no account) usage must keep working unchanged throughout.

- **Phase 1 (done):** `pages/api/generate-avatar.ts` uploads generated avatars to Vercel Blob and returns a durable URL when `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN` is configured; otherwise falls back to a base64 data URL (unchanged prior behavior).
- **Phase 2 (done):** Auth.js (`next-auth@4` — stable; v5/"Auth.js" is still beta and its simplified `auth()` helper is App-Router-only, which doesn't fit this repo's Pages-Router-authoritative API convention) with Google sign-in only, JWT sessions (no `sessions` table). `src/auth/authOptions.ts` holds the config; `pages/api/auth/[...nextauth].ts` mounts it — this route intentionally lives in `pages/api` (unlike `/reference`) since Auth.js v4's Pages Router integration is a direct default-export handler, not an App Router route handler. `src/db/schema.ts` (Drizzle, Postgres via Neon) defines just `users`/`accounts` so far. `src/db/client.ts` exports `getDb()`, a lazily-constructed singleton — it must never connect at module import time, since `next build` bundles (but never executes) API route handlers, and constructing eagerly would break the build whenever `DATABASE_URL` is unset. The Drizzle adapter in `authOptions.ts` is likewise only attached when `DATABASE_URL` is set — same degrade-gracefully shape as the Blob token and the Upstash rate-limit store. Use `src/utils/getSessionUserId.ts` in any future Pages Router handler that needs to know the signed-in user — never trust a client-supplied user id, same trust boundary `proxy.ts` enforces for request origin. Schema changes are applied locally via `npm run db:push` (Drizzle Kit, not part of `npm run ci` since it mutates external state). `proxy.ts` bypasses its origin/API-key check entirely for `/api/auth/*` — Auth.js's own signed CSRF/state cookies secure those routes, and Google's OAuth callback arrives with Google's own Referer, which the origin check would otherwise reject. `next.config.mjs`'s CSP `form-action` explicitly allows `https://accounts.google.com`, since Chrome enforces `form-action` against a form submission's eventual redirect target, not just its immediate action URL — without it, the sign-in form's redirect to Google is silently blocked with no visible error. Real Google sign-in only works on the static production domain: Google's redirect URI matching has no wildcard support, so it can't follow Vercel preview deployments' per-push URLs. Preview (`VERCEL_ENV === "preview"`) swaps Google out entirely for a stub `Credentials` provider (`id: "preview-stub"`, in `authOptions.ts`) that issues an ephemeral, unverified, non-DB-backed session from just an email string — good enough to exercise signed-in UI on a preview deployment. Swapped, not added alongside: Google has no client_id configured on preview and would just fail with `SIGNIN_OAUTH_ERROR` if offered there too. Guarded twice (excluded from the `providers` array outside preview, and rechecked inside `authorize()` itself) so it can never activate outside an actual Vercel preview build.
- **Not yet built:** `bots`/`messages` tables, row-scoped persistence in `pages/api/chat.ts`, and UI sign-in.
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
