import { expect, stubApi, test } from "./helpers";

for (const path of [
  "/",
  "/characters",
  "/leaderboard",
  "/privacy",
  "/guess-who",
  "/guess-who-next",
]) {
  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).not.toBeEmpty();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("landing form stays inside the viewport", async ({ page }) => {
  await page.goto("/");
  const box = await page.getByTestId("bot-creator-input").boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
});

test("landing carousel's name pill is not covered by the form", async ({ page }) => {
  await stubApi(page, "/api/chars?*", {
    characters: [{ name: "Sherlock Holmes", avatarUrl: "/silhouette.svg", category: "literature" }],
    hasMore: false,
  });
  await page.goto("/");
  const pill = page.getByRole("button", { name: /^View Sherlock Holmes/ });
  await expect(pill).toBeVisible();
  const reachable = await pill.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  });
  expect(reachable).toBe(true);
});
