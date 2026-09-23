/**
 * Guessing-game and leaderboard copy used by both the web app and the mobile app, so the
 * wording can't drift between them.
 */

export const GAME_INSTRUCTIONS = {
  title: "How to play",
  paragraphs: [
    "You're chatting with a real, named character, no mystery there. But as the conversation goes on, they'll start steering it toward someone else entirely: a different person they have in mind, dropping hints without ever saying the name.",
    "Ask questions to pull out more clues. When you think you know who they mean, type your guess right into the same chat box, there's no separate guess button, just keep talking. You don't need the exact full name; a nickname or good description works too. If it's unclear whether you're asking a question or guessing, they'll check with you before deciding.",
    "Guess right and that person becomes your new chat partner, hinting at someone else in turn, so keep the streak going as long as you can. You get one wrong guess per person: a second wrong guess ends the run and reveals the answer. You can also give up anytime to see who it was.",
  ],
  closeLabel: "Got it, let's play",
} as const;

export const GAME_GIVE_UP_CONFIRM = {
  title: "Give up this run?",
  body: "The hidden character will be revealed and the run will end. Your streak will stay as it is.",
  confirmLabel: "Yes, give up",
  cancelLabel: "Cancel",
} as const;

/** `{revealedName}`/`{streak}` are template placeholders — substitute before display. */
export const GAME_CORRECT_BANNER = "🎉 Correct! It was {revealedName}! Streak: {streak}.";

export const GAME_STREAK_LABEL = "Streak";

/** Start/game-over screen and in-round copy, mirrors GamePage.tsx. `{name}`/`{streak}` are placeholders. */
export const GAME_SCREEN_COPY = {
  headline: "Guess Who's Next?",
  subhead:
    "You'll start out chatting with a named character, no mystery there. As you talk, they'll start steering the conversation toward someone else entirely, and your job is to figure out who. Type your guess right in the chat. Guess right and that person joins the chat next, continuing the chain. One wrong guess is forgiven per person, but a second ends the run.",
  gameOverHeadline: "Game Over",
  gameOverSubhead: "They were describing {name}. Final streak: {streak}.",
  startLabel: "Start Game",
  playAgainLabel: "Play Again",
  continueLabel: "Continue",
  leaderboardLabel: "View leaderboard",
  startingLabel: "Starting new game…",
  continuingLabel: "Loading next character…",
  wrongBanner: "Not quite. You have one more guess before this run ends.",
} as const;

export const GAME_CTA_LABEL = "Play the Guessing Game";
export const CHARACTER_WALL_CTA_LABEL = "Pick from the Character Wall";

/** Leaderboard page and top-ten name-claim copy. */
export const LEADERBOARD_COPY = {
  title: "Guessing Game Leaderboard",
  tableCaption: "Public top 10 scores",
  loading: "Loading scores…",
  loadError: "Could not load the leaderboard. Please try again.",
  empty: "No players have shared a top 10 score yet.",
  rankLabel: "Rank",
  playerLabel: "Player",
  streakLabel: "Streak",
  playLabel: "Play Guessing Game",
  claimTitle: "You made the top 10!",
  claimBody:
    "Choose the name shown publicly with your best streak. Your account identity stays private.",
  claimNameLabel: "Leaderboard name",
  joinLabel: "Join leaderboard",
  updateLabel: "Update name",
  removeLabel: "Remove my name",
  settingsLoadError: "Could not load your leaderboard settings.",
  saveError: "Could not save your name",
  leaveError: "Could not leave the leaderboard",
} as const;
