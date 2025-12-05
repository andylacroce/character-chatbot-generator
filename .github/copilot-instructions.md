# Copilot / Agent Instructions — Character Chatbot Generator

Purpose: give an AI coding agent the minimal, actionable knowledge to make safe, correct changes quickly.

- **Quick commands**
  - Install: `npm install`
  - Dev: `npm run dev` (runs `next dev --turbopack`)
  - Build: `npm run build` (CI: `npm run ci` runs lint, type-check, coverage, then build)
  - Tests: `npm run test` ; Coverage: `npm run test:coverage`
  - Lint: `npm run lint` ; Type-check: `npm run type-check`

- **Big picture (files to inspect first)**
  - UI: `app/` — Next.js 16+ app router and React components live in `app/components/`.
  - Server/API: `pages/api/` — server handlers are authoritative (not serverless edge functions).
    - `pages/api/chat.ts` is the main complex endpoint (OpenAI calls, summarization, prompt caching, SSE streaming, TTS, continuation detection).
  - Auth/Zones: `proxy.ts` — origin validation and `x-api-key` (`API_SECRET`) enforcement for external requests.
  - Utilities: `src/utils/` — `api.ts`, `tts.ts`, `storage.ts`, `cache.ts`, `logger.ts`, `openaiModelSelector.ts`.
  - Model Selection: `src/utils/openaiModelSelector.ts` — **Production uses gpt-4o, development uses gpt-4o-mini**.

- **Client → Server flow (common change path)**
  - Client code (e.g. `app/components/useChatController.ts`) calls `authenticatedFetch('/api/chat', ...)` from `src/utils/api.ts`.
  - `pages/api/chat.ts` performs OpenAI chat using gpt-4o (prod) or gpt-4o-mini (dev), may summarize when history > 50 messages, and can stream via SSE when `{ stream: true }` is passed.
  - Smart continuation: detects truncated responses, wraps gracefully with "Would you like me to continue?" prompt, and resumes seamlessly when user says "yes".
  - If TTS is requested, server uses `src/utils/tts.ts` and a stable audio cache key (`getAudioCacheKey`) to avoid re-synthesis.

- **API contract & streaming**
  - Streaming SSE frames are sent as `data: JSON\n\n`.
  - Typical final server payload fields consumed by the client: `{ reply: string, audioFileUrl?: string, done: true }`.
  - If you change those fields, update `useChatController` and all client tests that parse stream frames.

- **Security & env**
  - Required env vars: `OPENAI_API_KEY`, `API_SECRET`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` (or `config/gcp-key.json`).
  - Do NOT commit secrets (there is a `config/gcp-key.json` in repo for local development only — keep it out of VCS in real projects).
  - To add deployment domains, update `allowedOrigins` in `proxy.ts` — this is the canonical place for origin rules.

- **Storage & naming conventions**
  - Use the safe storage wrapper: `src/utils/storage.ts` (localStorage + in-memory fallback in tests).
  - Common keys you will see and should reuse:
    - `chatbot-history-<bot.name>` — chat message history
    - `voiceConfig-<bot.name>` — versioned voice config (use versioned helpers in `storage.ts`)
    - `chatbot-bot` — serialized bot object

- **TTS & caching**
  - Synthesize via `src/utils/tts.ts` (`synthesizeSpeechToFile`) and respect `TTS_TMP_DIR` or system temp.
  - Audio caching uses a stable hash helper (`getAudioCacheKey`) — prefer reusing it to prevent duplicate generation.

- **Tests & mocks**
  - Tests live in `tests/` and run with Jest. Many tests mock `authenticatedFetch` instead of raw `fetch`.
  - TTS tests call `tts.__resetSingletonsForTest()` to avoid cross-test state.
  - When adding tests for client/server interactions, mock `authenticatedFetch` and any external API (OpenAI, GCP TTS).

- **When changing APIs or shapes**
  - If you modify `pages/api/chat.ts` response fields, update `app/components/useChatController.ts`, `ChatMessage` rendering logic, and tests under `tests/`.
  - If you change storage schema (voice config, history), use `src/utils/storage.ts` versioned helpers and add migrations/tests.

- **Files to read for context (always check these first on a PR)**
  - `pages/api/chat.ts`, `pages/api/audio.ts`, `pages/api/generate-avatar.ts`
  - `proxy.ts`
  - `app/components/useChatController.ts`, `ChatInput.tsx`, `ChatMessage.tsx`, `ChatMessagesList.tsx`
  - `src/utils/tts.ts`, `src/utils/storage.ts`, `src/utils/cache.ts`, `src/utils/api.ts`, `src/utils/logger.ts`
  - `tests/` (examples show mocking patterns and expectations)

- **Non-obvious conventions**
  - Prefer `authenticatedFetch` for client→server calls so tests can mock it consistently.
  - Voice configurations are versioned; do not change their shape without adding a migration helper and tests.
  - SSE streaming protocol is lightweight JSON frames, not a custom binary protocol — keep parsers simple.

If anything here is unclear or you want more detail in a specific area (e.g., SSE parsing, TTS cache codepaths, or storage migrations), tell me which part and I will expand or add code snippets and test examples.
