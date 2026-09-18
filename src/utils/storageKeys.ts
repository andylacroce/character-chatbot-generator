/**
 * Single source of truth for localStorage key names, so a read site and a write
 * site can never drift apart on the literal string. See CLAUDE.md's "Client-side
 * storage" section for what each key holds.
 */
export const STORAGE_KEYS = {
  bot: "chatbot-bot",
  botTimestamp: "chatbot-bot-timestamp",
  audioEnabled: "audioEnabled",
  darkMode: "darkMode",
  sessionId: "bot-session-id",
  sessionDatetime: "bot-session-datetime",
  userName: "chatbot-user-name",
  // Set once a guest explicitly dismisses the post-creation name gate, so it
  // doesn't reappear on every subsequent character in this browser.
  userNameGateSkipped: "chatbot-user-name-gate-skipped",
  // The guessing game's current round state (see src/utils/gameToken.ts) and its
  // transcript, plus a one-time "how to play" gate — flat keys, not name-suffixed like
  // chatHistoryKey, since the mystery character's identity is secret and the round is
  // overwritten every time a new game starts.
  gameToken: "chatbot-game-token",
  gameTranscript: "chatbot-game-transcript",
  gameInstructionsSeen: "chatbot-game-instructions-seen",
} as const;

/** Prefixes for keys that are suffixed per-character by bot name. */
export const STORAGE_KEY_PREFIXES = {
  chatHistory: "chatbot-history-",
  voiceConfig: "voiceConfig-",
  lastPlayedAudioHash: "lastPlayedAudioHash-",
} as const;

/** Per-character localStorage key for a bot's chat history. */
export function chatHistoryKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.chatHistory}${botName}`;
}

/** Per-character localStorage key for a bot's voice config. */
export function voiceConfigKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.voiceConfig}${botName}`;
}

/** Per-character localStorage key for the last-played audio hash (dedupe on reload). */
export function lastPlayedAudioHashKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.lastPlayedAudioHash}${botName}`;
}
