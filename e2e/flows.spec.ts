import { expect, test } from "@playwright/test";
import { blockBilledApi, stubApi, stubSse } from "./helpers";

const VOICE = { languageCodes: ["en-US"], name: "en-US-Neural2-D", ssmlGender: 1 };

test.beforeEach(async ({ page }) => {
  await blockBilledApi(page);
  // Skip the first-visit instructions modal so the game flow starts on the real UI.
  await page.addInitScript(() => {
    localStorage.setItem("chatbot-guess-who-instructions-seen", "true");
  });
});

/** Stubs the creation pipeline for `name` and the chat reply. */
async function stubCreation(page: import("@playwright/test").Page, name: string) {
  await stubApi(page, "/api/validate-character", {
    characterName: name,
    isPublicDomain: true,
    isSafe: true,
    warningLevel: "none",
    recognized: true,
  });
  await stubApi(page, "/api/generate-personality", { personality: "Wise.", correctedName: name });
  await stubApi(page, "/api/generate-avatar", { avatarUrl: "/silhouette.svg", gender: "male" });
  await stubApi(page, "/api/get-voice-config", VOICE);
  await stubApi(page, "/api/health", { status: "ok" });
  await stubApi(page, "/api/chat", { reply: "Greetings, traveler." });
}

async function startChat(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  // Wait for hydration: an early click lands before React attaches the handler.
  await page.waitForLoadState("networkidle");
  await page.getByTestId("bot-creator-input").fill(name);
  await page.getByTestId("bot-creator-button").click();
  // The one-time "what should we call you" gate pauses the first creation; skip it to resume.
  await page.getByRole("button", { name: "Skip for now" }).click();
}

test("create a character, then chat", async ({ page }) => {
  await stubCreation(page, "Sherlock Holmes");
  await startChat(page, "Sherlock Holmes");

  await expect(page.getByTestId("chat-messages-container")).toContainText("Greetings, traveler.");
  await page.getByTestId("chat-input").fill("Hello there");
  await page.getByTestId("chat-send-button").click();
  await expect(page.getByTestId("chat-messages-container")).toContainText("Hello there");
});

test("a copyright warning shows the modal", async ({ page }) => {
  await stubCreation(page, "Mickey Mouse");
  await stubApi(page, "/api/validate-character", {
    characterName: "Mickey Mouse",
    isPublicDomain: false,
    isSafe: true,
    warningLevel: "warning",
    reason: "Mickey Mouse is a protected character.",
    recognized: true,
  });
  await startChat(page, "Mickey Mouse");

  await expect(page.getByText("Continue Anyway")).toBeVisible();
  await expect(page.getByTestId("chat-messages-container")).toHaveCount(0);
});

test("an unrecognized name is a hard stop", async ({ page }) => {
  await stubCreation(page, "Zxqv Blorp");
  await stubApi(page, "/api/validate-character", {
    characterName: "Zxqv Blorp",
    isPublicDomain: true,
    isSafe: true,
    warningLevel: "none",
    recognized: false,
  });
  await startChat(page, "Zxqv Blorp");

  await expect(page.getByText(/couldn.t identify/i)).toBeVisible();
  await expect(page.getByTestId("chat-messages-container")).toHaveCount(0);
});

test("Guess Who: start, guess correctly, continue", async ({ page }) => {
  await stubSse(page, "/api/guess-who/start", {
    guessWhoToken: "t1",
    reply: "I wield a thunderbolt.",
    streak: 0,
  });
  await stubApi(page, "/api/guess-who/message", {
    guessWhoToken: "t2",
    correct: true,
    reply: "You got me!",
    revealedName: "Zeus",
    streak: 1,
  });
  await stubSse(page, "/api/guess-who/continue", {
    guessWhoToken: "t3",
    reply: "I guard the underworld.",
    streak: 1,
  });
  await stubApi(page, "/api/guess-who/high-score", { highScore: null });

  await page.goto("/guess-who");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("game-start-button").click({ timeout: 15_000 });
  await expect(page.getByText("I wield a thunderbolt.")).toBeVisible();

  await page.getByTestId("chat-input").fill("Is it Zeus?");
  await page.getByTestId("chat-send-button").click();
  await expect(page.getByTestId("game-event-correct")).toContainText("Zeus");

  await page.getByTestId("game-continue-button").click();
  await expect(page.getByText("I guard the underworld.")).toBeVisible();
});
