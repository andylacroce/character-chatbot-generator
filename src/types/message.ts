// =============================
// message.ts
// TypeScript types and interfaces for chat message objects.
// Used throughout the app for type safety and clarity.
// =============================

// Shared type for chat messages
export interface Message {
  text: string;
  sender: string;
  audioFileUrl?: string;
  /**
   * The sender's avatar at the time this message was created. Optional and mainly for
   * the guessing game, where the "current" character changes mid-transcript — without
   * this, every message renders whatever avatar is current *now* (see ChatMessage.tsx),
   * which silently relabels past rounds' messages to the wrong character on every round
   * switch. Ordinary chat never sets this since its single bot's avatar never changes.
   */
  avatarUrl?: string;
}
