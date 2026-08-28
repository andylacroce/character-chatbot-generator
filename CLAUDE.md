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

### API documentation

Every `pages/api/*.ts` handler carries a `@swagger` JSDoc block (OpenAPI 3.0). `npm run docs:api` (`scripts/generate-openapi.cjs`, via `swagger-jsdoc`) reads those comments and writes `public/openapi.json` — a gitignored, build-time artifact, not something to hand-edit or commit. It runs automatically before `dev`/`build`/`vercel-build`; run it directly after touching a route's annotations. `app/reference/route.ts` serves the interactive UI (`@scalar/nextjs-api-reference`) at `/reference`, reading that same static file — deliberately not scanning route source at request time, since Vercel's serverless bundler doesn't reliably ship raw `.ts` alongside compiled output. The route lives outside `pages/api`, so it isn't subject to `proxy.ts` auth. `swagger-jsdoc`'s glob resolution doesn't match backslash-separated paths, so the script normalizes to forward slashes before passing them in — same class of Windows/POSIX path bug as elsewhere in this repo; keep that in mind if `docs:api` starts reporting 0 documented paths locally.

### Module system (do not regress)

`package.json` intentionally has no `"type": "module"` — removing it previously fixed a Vercel `ERR_REQUIRE_ESM` crash where Next's CJS serverless launcher couldn't `require()` compiled API route output. `next.config.mjs` uses an explicit `.mjs` extension instead so it's still treated as ESM. Source (TS, `import`/`export`) compiles fine either way via SWC — don't re-add `"type": "module"`.

## Environment variables

Required: `ANTHROPIC_API_KEY`, `API_SECRET` (checked by `proxy.ts`), `GOOGLE_APPLICATION_CREDENTIALS_JSON` (path or raw JSON), `GOOGLE_CLOUD_PROJECT`.
Optional: `VERCEL_BLOB_READ_WRITE_TOKEN` (enables Vercel Blob logging), `TTS_TMP_DIR` (defaults to system temp), `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) to share rate-limit counters across instances.

### Rate limiting

`createRateLimiter({ name, max, message, windowMs? })` in `src/utils/rateLimit.ts` wraps every limited route. `name` is required and namespaces the counter (`rl:<name>:<ip>`) — a shared store is shared across routes, so without it `/api/chat` and `/api/audio` would draw down the same budget. With no Redis env vars configured the limiter uses `express-rate-limit`'s in-process MemoryStore, which is correct for local dev and per-instance on Vercel; with them set, `src/utils/rateLimitStore.ts` backs it with an Upstash-compatible Redis REST store and the limits become global. Store outages fail open (`passOnStoreError`) — the limiter throttles, `proxy.ts` authenticates.

## Testing conventions

- Tests live under `tests/`, organized to mirror source (`tests/api`, `tests/app`, `tests/pages`, `tests/src`, `tests/utils`, `tests/integration`, `tests/unit`).
- Mock `authenticatedFetch`, not raw `fetch`, for client/server interaction tests.
- TTS tests must call `tts.__resetSingletonsForTest()` to avoid cross-test singleton state leaking.
- Mock external APIs (Anthropic, GCP TTS/Vertex) rather than calling them live.
