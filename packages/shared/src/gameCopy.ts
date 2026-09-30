/**
 * Guessing-game and leaderboard copy used by both the web app and the mobile app, so the
 * wording can't drift between them. Each game's copy is one `GameCopy` object, looked up
 * through its `GameDefinition` (game.ts); `LEADERBOARD_COPY` is shared chrome reused by
 * both games' leaderboard screens.
 */

/** Everything user-facing one guessing game needs, identical in shape for both games. */
export interface GameCopy {
  /** Kept short and scannable: a one-line premise, a handful of short bullets, one goal line. */
  instructions: {
    title: string;
    premise: string;
    bullets: readonly string[];
    goal: string;
    closeLabel: string;
  };
  giveUpConfirm: {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
  };
  /** `{revealedName}`/`{streak}` are template placeholders, substituted before display. */
  correctBanner: string;
  streakLabel: string;
  /** Start/game-over screen and in-round copy. `{name}`/`{streak}` are placeholders. */
  screen: {
    headline: string;
    subhead: string;
    gameOverHeadline: string;
    gameOverSubhead: string;
    startLabel: string;
    playAgainLabel: string;
    continueLabel: string;
    leaderboardLabel: string;
    startingLabel: string;
    continuingLabel: string;
    wrongBanner: string;
  };
  /** The landing page's "play this game" link label. */
  ctaLabel: string;
}

/** Copy for "Guess Who's Next" (the chat-steering game). */
export const GUESS_WHO_NEXT_COPY: GameCopy = {
  instructions: {
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
  },
  giveUpConfirm: {
    title: "Give up this run?",
    body: "The hidden character will be revealed and the run will end. Your streak will stay as it is.",
    confirmLabel: "Yes, give up",
    cancelLabel: "Cancel",
  },
  correctBanner: "🎉 Correct! It was {revealedName}! Streak: {streak}.",
  streakLabel: "Streak",
  screen: {
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
  },
  ctaLabel: "Play Guess Who's Next",
};

/** Copy for "Guess Who" (the self-describing chat game). */
export const GUESS_WHO_COPY: GameCopy = {
  instructions: {
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
  },
  giveUpConfirm: {
    title: "Give up this run?",
    body: "The mystery character will be revealed and the run will end. Your streak will stay as it is.",
    confirmLabel: "Yes, give up",
    cancelLabel: "Cancel",
  },
  correctBanner: "🎉 Correct! It was {revealedName}! Streak: {streak}.",
  streakLabel: "Streak",
  screen: {
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
  },
  ctaLabel: "Play Guess Who",
};

export const CHARACTER_WALL_CTA_LABEL = "Pick from the Character Wall";

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
