import type { Page, Route } from "@playwright/test";

/** Endpoints that call Claude, Google, or an image provider; a synthetic must never reach them. */
const BILLED_API =
  /\/api\/(chat|validate-character|generate-|get-voice-config|audio|health|[\w-]+\/(start|continue|message))/;

/**
 * Fails any test that reaches a billed endpoint. Call before `stubApi`: Playwright runs the
 * most recently registered matching route, so stubs registered later win and only unstubbed
 * billed calls hit this guard.
 */
export async function blockBilledApi(page: Page) {
  await page.route(BILLED_API, (route) => {
    throw new Error(`e2e hit a billed endpoint: ${route.request().url()}`);
  });
}

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
