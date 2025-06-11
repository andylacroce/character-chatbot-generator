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
}
