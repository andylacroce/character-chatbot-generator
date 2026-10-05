import { expect, test } from "@playwright/test";

/** Endpoints that call Claude, Google, or an image provider; a synthetic must never reach them. */
const BILLED_API =
  /\/api\/(chat|validate-character|generate-|get-voice-config|audio|health|[\w-]+\/(start|continue|message))/;

test.beforeEach(async ({ page }) => {
  await page.route(BILLED_API, (route) => {
    throw new Error(`e2e hit a billed endpoint: ${route.request().url()}`);
  });
});

const PAGES = ["/", "/chars", "/leaderboard", "/privacy", "/guess-who", "/guess-who-next"];

for (const path of PAGES) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toBeEmpty();
    expect(errors).toEqual([]);
  });
}

test("landing page: random button fills the name field", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("games-invitation-band")).toBeVisible();
  await page.getByRole("button", { name: "Choose a random character name" }).click();
  await expect(page.getByTestId("bot-creator-input")).not.toHaveValue("");
});

test("unknown route and admin page 404", async ({ page }) => {
  expect((await page.goto("/no-such-page"))?.status()).toBe(404);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});

test("random-character API returns a name", async ({ request }) => {
  const res = await request.get("/api/random-character");
  expect(res.ok()).toBe(true);
  expect((await res.json()).name).toBeTruthy();
});
