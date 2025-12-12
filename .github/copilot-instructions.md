# Copilot / Agent Instructions — Character Chatbot Generator

Purpose: give an AI coding agent the minimal, actionable knowledge to make safe, correct changes quickly.

- **Quick commands**
  - Install: `npm install`
  - Dev: `npm run dev` (runs `next dev --turbopack`)
  - Build: `npm run build` (CI: `npm run ci` runs lint, type-check, coverage, then build)
  - Tests: `npm run test` ; Coverage: `npm run test:coverage` ; Watch: `npm run test:watch`
  - Lint: `npm run lint` ; Auto-fix: `npm run lint:fix`
  - Type-check: `npm run type-check` ; Watch: `npm run type-check:watch`
  - Bundle analysis: `npm run analyze`

- **Big picture (files to inspect first)**
  - UI: `app/` — Next.js 16+ app router and React components live in `app/components/`.
  - Server/API: `pages/api/` — server handlers are authoritative (not serverless edge functions).
    - `pages/api/chat.ts` is the main complex endpoint (OpenAI calls, summarization, prompt caching, SSE streaming, TTS, continuation detection).
    - `pages/api/validate-character.ts` — copyright/trademark validation using OpenAI (returns warning/caution/none levels).
    - `pages/api/random-character.ts` — generates public domain character suggestions with guardrails against modern copyrighted characters.
  - Auth/Zones: `proxy.ts` — origin validation and `x-api-key` (`API_SECRET`) enforcement for external requests.
  - Utilities: `src/utils/` — `api.ts`, `tts.ts`, `storage.ts`, `cache.ts`, `logger.ts`, `openaiModelSelector.ts`.
  - Model Selection: `src/utils/openaiModelSelector.ts` — **Production uses gpt-4o, development uses gpt-4o-mini**.

- **Client → Server flow (common change path)**
  - Client code (e.g. `app/components/useChatController.ts`) calls `authenticatedFetch('/api/chat', ...)` from `src/utils/api.ts`.
  - `pages/api/chat.ts` performs OpenAI chat using gpt-4o (prod) or gpt-4o-mini (dev), may summarize when history > 50 messages, and can stream via SSE when `{ stream: true }` is passed.
  - Smart continuation: detects truncated responses, wraps gracefully with "Would you like me to continue?" prompt, and resumes seamlessly when user says "yes".
  - If TTS is requested, server uses `src/utils/tts.ts` and a stable audio cache key (`getAudioCacheKey`) to avoid re-synthesis.
  - **Copyright validation flow**: `useBotCreation.ts` calls `/api/validate-character` before bot creation; if warning/caution level returned, shows `CopyrightWarningModal.tsx` with public domain alternatives from `/api/random-character`.

- **Copyright protection system**
  - `/api/validate-character` — POST endpoint accepting `{ characterName: string }`, returns `{ level: "warning" | "caution" | "none", message?: string, suggestions?: string[] }`.
    - Uses OpenAI to detect copyrighted/trademarked characters (rate-limited to 30 req/min).
    - "warning": Clear copyright/trademark violation (e.g., Mickey Mouse, Harry Potter).
    - "caution": Possible trademark concern (e.g., Superman, Batman).
    - "none": Safe to use (public domain or generic names).
  - `/api/random-character` — GET endpoint returning `{ suggestions: string[] }` of public domain characters (pre-1928, mythology, historical figures).
    - Excludes modern copyrighted characters via explicit OpenAI prompt guardrails.
  - `CopyrightWarningModal.tsx` — Modal component integrated into `BotCreator.module.css`, displays warning/caution messages with clickable suggestions.
  - Client integration: `useBotCreation.ts` hook handles `validateCharacterName()`, modal state, and suggestion selection via `handleValidationSuggestion()`.
  - **When changing validation logic**: Update both validation API and modal UI, then update tests in `tests/api/validateCharacter.test.ts` and `tests/app/components/CopyrightWarningModal.test.tsx`. Maintain 80%+ branch coverage.

- **API contract & streaming**
  - Streaming SSE frames are sent as `data: JSON\n\n`.
  - Typical final server payload fields consumed by the client: `{ reply: string, audioFileUrl?: string, done: true }`.
  - If you change those fields, update `useChatController` and all client tests that parse stream frames.
  - Experimental `optimizeCss` is enabled (Next.js 16). Avoid disabling unless debugging CSS regressions.

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
  - `pages/api/validate-character.ts`, `pages/api/random-character.ts` (copyright validation)
  - `proxy.ts`
  - `app/components/useChatController.ts`, `ChatInput.tsx`, `ChatMessage.tsx`, `ChatMessagesList.tsx`
  - `app/components/useBotCreation.ts`, `BotCreator.tsx`, `CopyrightWarningModal.tsx` (bot creation + validation)
  - `src/utils/tts.ts`, `src/utils/storage.ts`, `src/utils/cache.ts`, `src/utils/api.ts`, `src/utils/logger.ts`
  - `tests/` (examples show mocking patterns and expectations)

- **Non-obvious conventions**
  - Prefer `authenticatedFetch` for client→server calls so tests can mock it consistently.
  - Voice configurations are versioned; do not change their shape without adding a migration helper and tests.
  - SSE streaming protocol is lightweight JSON frames, not a custom binary protocol — keep parsers simple.

If anything here is unclear or you want more detail in a specific area (e.g., SSE parsing, TTS cache codepaths, or storage migrations), tell me which part and I will expand or add code snippets and test examples.
