import { expect, test } from "@playwright/test";
import { blockBilledApi } from "./helpers";

test.beforeEach(({ page }) => blockBilledApi(page));

for (const path of ["/", "/chars", "/leaderboard", "/privacy", "/guess-who", "/guess-who-next"]) {
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
