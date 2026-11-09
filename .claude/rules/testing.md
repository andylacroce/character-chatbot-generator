---
paths:
  - "tests/**"
  - "e2e/**"
  - "playwright.config.ts"
  - "jest.config.cjs"
---

### Testing conventions

- **E2E smoke (`e2e/`, `playwright.config.ts`)** runs a few synthetics (key pages render with no
  page errors, the random button works, 404s) against a production build on port 3100, inside the
  `build` job in `ci.yml` (reusing that build; Chromium installs in parallel with it). **It must never spend Claude/Google/image tokens:** the server gets a dummy
  `ANTHROPIC_API_KEY`, and `smoke.spec.ts` throws on any request matching `BILLED_API`. Extend it
  only with synthetics that stay off those routes. To add one:
  1. Import `test`/`expect` from `e2e/helpers.ts`, never `@playwright/test` (ESLint enforces it).
     Its `test` auto-blocks every billed endpoint; a stub registered inside a test wins.
  2. Stub what the flow needs with `stubApi` (JSON) or `stubSse` (streamed game rounds), building
     bodies from `fixtures` (typed against `packages/shared/src/types.ts`, so a stub can't drift
     from the real shape). Add a fixture rather than an inline literal when a shape repeats.
  3. `await page.waitForLoadState("networkidle")` after `goto` before clicking (a click before
     hydration does nothing). A first creation hits the name gate, so click "Skip for now".
  4. Layout-sensitive checks belong in `layout.spec.ts`. `playwright.config.ts` runs everything on
     `desktop` and only `flows`/`layout` again on `mobile` (Pixel 7, Chromium).
  CI uploads the HTML report, traces, and failure screenshots as the `playwright-report` artifact.
  **Sandbox browser mismatch:** a Playwright bump can expect a newer Chromium build than a sandbox
  preinstalls (Claude Code cloud has `/opt/pw-browsers`), failing every test with "Executable doesn't
  exist". Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed binary (e.g.
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) instead of running `playwright install`.

- Tests live under `tests/`, mirroring source (`tests/api`, `tests/app`, `tests/pages`, `tests/src`,
  `tests/utils`, `tests/integration`, `tests/unit`).
- **A module split out of a larger file gets its own test file named after it** (`useChatIntro.test.ts`,
  `gameStats.test.ts`), in the folder its neighbors use. The original integration-style tests of the
  parent (`chat.test.ts`, `useChatController.*`) stay as the behavior pin; don't fold them into the new files.
  `tests/helpers/fakeStatsDb.ts` fakes the Drizzle query chain for the stats aggregations.
- Mock `authenticatedFetch`, not raw `fetch`, for client/server interaction tests, and mock external
  APIs (Anthropic, GCP TTS/Vertex) rather than calling them live.
- TTS tests must call `tts.__resetSingletonsForTest()` to avoid leaking singleton state.
- For code reading an SSE (`stream: true`) response via `response.body.getReader()` (the games'
  `fetchRoundWithProgress`, `chat.ts`'s streaming mode), use `tests/helpers/mockResponse.ts`'s
  `mockSseResponse` (all frames queued) or `mockControlledSseResponse` (frames pushed one at a time,
  to assert state *between* events such as a staged-progress label). A plain `mockResponse()` has no
  `.body` and hangs or fails.
