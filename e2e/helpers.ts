import { expect, test as base, type Page, type Route } from "@playwright/test";
import type { CharacterValidationResult, CharacterVoiceConfig } from "../packages/shared/src/types";

/** Endpoints that call Claude, Google, or an image provider; a synthetic must never reach them. */
const BILLED_API =
  /\/api\/(chat|validate-character|generate-|get-voice-config|audio|health|[\w-]+\/(start|continue|message))/;

/**
 * Playwright's `test`, with every billed endpoint blocked in each test automatically. Specs
 * import this instead of `@playwright/test` (lint enforces it), so a new spec can't forget the
 * guard. Stubs registered inside a test win over it: the latest matching route runs.
 */
export const test = base.extend<{ billedApiGuard: void }>({
  billedApiGuard: [
    async ({ page }, use) => {
      await page.route(BILLED_API, (route) => {
        throw new Error(`e2e hit a billed endpoint: ${route.request().url()}`);
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** Typed canned responses, so a stub can't drift from the shapes the app actually parses. */
export const fixtures = {
  validation: (name: string, overrides: Partial<CharacterValidationResult> = {}) =>
    ({
      characterName: name,
      isPublicDomain: true,
      isSafe: true,
      warningLevel: "none",
      recognized: true,
      ...overrides,
    }) satisfies CharacterValidationResult,
  voice: {
    languageCodes: ["en-US"],
    name: "en-US-Neural2-D",
    ssmlGender: 1,
  } satisfies CharacterVoiceConfig,
};

/** Answers a billed endpoint with canned JSON. `body` may be a function of the request body. */
export async function stubApi(
  page: Page,
  path: string,
  body: object | ((request: Record<string, unknown>) => object),
) {
  await page.route(`**${path}`, (route: Route) => {
    const sent = route.request().postDataJSON?.() ?? {};
    return route.fulfill({ json: typeof body === "function" ? body(sent) : body });
  });
}

/** Answers a streamed round endpoint (`stream: true`) with one final SSE frame. */
export async function stubSse(page: Page, path: string, final: object) {
  await page.route(`**${path}`, (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ ...final, done: true })}\n\n`,
    }),
  );
}
