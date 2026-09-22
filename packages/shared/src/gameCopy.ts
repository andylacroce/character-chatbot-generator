/**
 * Guessing-game copy shared between platforms, so wording stays identical without a manual
 * resync — mirrors the web app's app/components/GameInstructionsModal.tsx and GamePage.tsx
 * verbatim. The web app doesn't consume this yet (still self-contained pending a later
 * refactor — see character-chatbot-mobile's CLAUDE.md), but centralizing it here now means
 * that refactor is a re-point, not a rewrite.
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
} as const;

/** `{revealedName}`/`{streak}` are template placeholders — substitute before display. */
export const GAME_CORRECT_BANNER = "🎉 Correct! It was {revealedName}! Streak: {streak}.";

export const GAME_STREAK_LABEL = "Streak";

export const GAME_CTA_LABEL = "Play the Guessing Game";
export const CHARACTER_WALL_CTA_LABEL = "Pick from the Character Wall";
