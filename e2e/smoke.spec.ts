import { expect, test } from "./helpers";

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
  // A character page with no database (or an unknown slug) is a clean 404, not a crash.
  expect((await page.goto("/chars/no-such-character"))?.status()).toBe(404);
});

test("random-character API returns a name", async ({ request }) => {
  const res = await request.get("/api/random-character");
  expect(res.ok()).toBe(true);
  expect((await res.json()).name).toBeTruthy();
});

test("robots.txt and sitemap.xml point crawlers at the production origin", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("character-chatbot-generator.vercel.app/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(
    "<loc>https://character-chatbot-generator.vercel.app/chars</loc>",
  );
});

test("link-preview tags are unique and absolute", async ({ page }) => {
  await page.goto("/privacy");
  const image = page.locator('meta[property="og:image"]');
  expect(await image.count()).toBe(1);
  expect(await image.getAttribute("content")).toMatch(/^https:\/\/[^/]+\/og-image\.png$/);
  expect(await page.locator("title").count()).toBe(1);
});
