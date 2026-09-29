/**
 * Guessing-game and leaderboard copy used by both the web app and the mobile app, so the
 * wording can't drift between them. `GUESS_WHO_NEXT_*` constants are specific to
 * "Guess Who's Next" (the chat-steering game); `LEADERBOARD_COPY` is shared chrome
 * reused by both games' leaderboard screens.
 */

/**
 * Kept short and scannable per product direction: a one-line premise, a handful of
 * short bullets, one goal line — not a paragraph. Rendered inside GameInstructionsModal.
 */
export const GUESS_WHO_NEXT_INSTRUCTIONS = {
  title: "How to play Guess Who's Next",
  premise: "You're chatting with a real character who's secretly thinking of someone else.",
  bullets: [
    "Ask questions to narrow it down",
    "Type your guess anytime, right in the chat box",
    "One wrong guess is OK, a second ends the run",
    "Guess right and that person joins the chat next",
  ],
  goal: "Keep guessing right to build your streak.",
  closeLabel: "Got it, let's play",
} as const;

export const GUESS_WHO_NEXT_GIVE_UP_CONFIRM = {
  title: "Give up this run?",
  body: "The hidden character will be revealed and the run will end. Your streak will stay as it is.",
  confirmLabel: "Yes, give up",
  cancelLabel: "Cancel",
} as const;

/** `{revealedName}`/`{streak}` are template placeholders — substitute before display. */
export const GUESS_WHO_NEXT_CORRECT_BANNER = "🎉 Correct! It was {revealedName}! Streak: {streak}.";

export const GUESS_WHO_NEXT_STREAK_LABEL = "Streak";

/** Start/game-over screen and in-round copy, mirrors GuessWhoNextPage.tsx. `{name}`/`{streak}` are placeholders. */
export const GUESS_WHO_NEXT_SCREEN_COPY = {
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

export const GUESS_WHO_NEXT_CTA_LABEL = "Play Guess Who's Next";
export const CHARACTER_WALL_CTA_LABEL = "Pick from the Character Wall";

/** Short, scannable "how to play" copy for "Guess Who" (the self-describing chat game). */
export const GUESS_WHO_INSTRUCTIONS = {
  title: "How to play Guess Who",
  premise: "You're chatting with a mystery character who won't say their own name.",
  bullets: [
    "Ask questions to narrow it down",
    "Type your guess anytime, right in the chat box",
    "One wrong guess is OK, a second ends the run",
    "Guess right and a new mystery character begins",
  ],
  goal: "Keep guessing right to build your streak.",
  closeLabel: "Got it, let's play",
} as const;

export const GUESS_WHO_GIVE_UP_CONFIRM = {
  title: "Give up this run?",
  body: "The mystery character will be revealed and the run will end. Your streak will stay as it is.",
  confirmLabel: "Yes, give up",
  cancelLabel: "Cancel",
} as const;

/** `{revealedName}`/`{streak}` are template placeholders — substitute before display. */
export const GUESS_WHO_CORRECT_BANNER = "🎉 Correct! It was {revealedName}! Streak: {streak}.";

export const GUESS_WHO_STREAK_LABEL = "Streak";

/** Start/game-over screen and in-round copy for "Guess Who". `{name}`/`{streak}` are placeholders. */
export const GUESS_WHO_SCREEN_COPY = {
  headline: "Guess Who?",
  subhead:
    "You'll start chatting with a mystery character who never says their own name. Ask questions, and they'll naturally drop real clues about themselves as you talk. Type your guess right in the chat. Guess right and a new mystery character begins, building your streak. One wrong guess is forgiven, but a second ends the run.",
  gameOverHeadline: "Game Over",
  gameOverSubhead: "It was {name}. Final streak: {streak}.",
  startLabel: "Start Game",
  playAgainLabel: "Play Again",
  continueLabel: "Continue",
  leaderboardLabel: "View leaderboard",
  startingLabel: "Starting new game…",
  continuingLabel: "Loading next mystery character…",
  wrongBanner: "Not quite. You have one more guess before this run ends.",
} as const;

export const GUESS_WHO_CTA_LABEL = "Play Guess Who";

/** Leaderboard page and top-ten name-claim copy, shared chrome for both games' tabs. */
export const LEADERBOARD_COPY = {
  title: "Leaderboard",
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
