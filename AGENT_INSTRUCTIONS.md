# Character Chatbot Generator — Agent Instructions

Purpose: concise, repo-specific instructions for AI coding agents to be immediately productive.

Architecture (big picture)
- Frontend: Next.js app in `app/` (React 19). Main UI components live under `app/components/`.
- API: Next.js API routes live in `pages/api/` (e.g. `chat.ts`, `audio.ts`, `generate-avatar.ts`). These are the authoritative server handlers.
- Middleware: `proxy.ts` enforces allowed origins and `API_SECRET` for external requests — update `allowedOrigins` when adding domains.
- Utilities: `src/utils/` contains core helpers: `api.ts`, `tts.ts`, `storage.ts`, `cache.ts`, `logger.ts`, `openaiModelSelector.ts` and `characterVoices`.

Developer workflows & commands
- Install: `npm install` (Node >= 18 recommended).
- Dev server: `npm run dev` (runs `next dev --turbopack`).
- Build: `npm run build` (or `npm run build:ci` to run tests then build).
- Tests: `npm run test` (Jest). Coverage: `npm run test:coverage`.
- Lint: `npm run lint`. Type-check: `npm run type-check`.

Security & environment
- Required env vars: `OPENAI_API_KEY`, `API_SECRET`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` (or place JSON at `config/gcp-key.json`). See `README.md`.
- Do NOT commit service account JSON (`config/gcp-key.json`) or any secrets.
- API routes are protected by `proxy.ts` — changes to auth must keep origin checks and `x-api-key` behavior.

Project-specific conventions
- Client → server: use `authenticatedFetch('/api/...', ...)` from `src/utils/api.ts`. Tests routinely mock `authenticatedFetch` instead of `fetch`.
- Storage keys: follow existing key patterns:
  - `chatbot-history-<bot.name>` — chat message history
  - `voiceConfig-<bot.name>` — versioned voice config (use `storage.setVersionedJSON`/`getVersionedJSON`)
  - `chatbot-bot` — serialized bot object
- Voice configs are versioned; use `src/utils/storage.ts` migration helpers when changing schema.

Server-side patterns to respect
- `pages/api/chat.ts`:
  - Performs OpenAI chat calls, conversation summarization (when >50 messages), prompt caching, and TTS synthesis.
  - Supports streaming SSE when body `{ stream: true }` is passed — SSE frames are `data: JSON\n\n` with `{chunk, done}` or final `{reply, audioFileUrl, done}`.
  - TTS uses `src/utils/tts.ts` and caches audio using a stable hash (`getAudioCacheKey`). Prefer reusing that logic to avoid duplicate audio generation.
- TTS: use `synthesizeSpeechToFile` and honor `TTS_TMP_DIR` and fallbacks to `/tmp` or `public/audio`.

Testing notes for agents
- Test runner: Jest (see `tests/`). Many tests mock `authenticatedFetch` and `tts.__resetSingletonsForTest` for isolation.
- When adding tests, follow existing patterns in `tests/` (mock API responses, mock storage read/write via `src/utils/storage.ts` memory fallback).

Testing / Coverage
- Run full coverage report: `npm run test:coverage` (this runs `jest --coverage`). Review the `text` output in the terminal and open `coverage/lcov-report/index.html` for a browsable report.
- Quick single-file coverage: `npx jest tests/path/to/test --runInBand --coverage` to collect coverage for one file.
- Baseline & CI: README documents ~91% coverage; `npm run build:ci` runs `npm run test:coverage` then `next build`. Keep coverage near the baseline when modifying core logic.
- Enforcing thresholds: there is no enforced coverage threshold currently. To enforce one (recommended for CI), add a `coverageThreshold` block to `jest.config.cjs`, for example:

```js
// jest.config.cjs (example)
module.exports = {
  // ...existing config
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90,
    },
  },
};
```

- Alternative quick check: create a small npm script that runs `npm run test:coverage` and parses the `text-summary` output to fail when metrics fall below thresholds. Ask me and I can add that helper script.

Files to inspect when making changes
- `pages/api/chat.ts` — chat, caching, summarization, streaming, and TTS flow.
- `proxy.ts` — origin and API key validation for `/api/*`.
- `app/components/useChatController.ts` — client-side orchestration, storage keys, and audio playback behavior.
- `src/utils/tts.ts`, `src/utils/storage.ts`, `src/utils/cache.ts`, `src/utils/api.ts`, `src/utils/logger.ts`, `characterVoices`.

When modifying behavior
- Keep API contract stable (request/response shape used by `useChatController`). If you change `pages/api/chat.ts` response fields, update client code in `app/components/*` and tests.
- Update or add unit tests in `tests/` for any new server/client behavior; mock `authenticatedFetch` in client tests.

If unsure, quick checks
- Start dev server: `npm run dev` and hit `http://localhost:3000`.
- Run single test file: `npx jest tests/path/to/test --runInBand`.

Questions or unclear areas: ask for desired scope (UI change vs API change) and whether to run tests locally; I will update instructions accordingly.
