/**
 * Single source of truth for client-storage key names, shared between the web
 * app's localStorage and the mobile app's AsyncStorage. Keeping the strings
 * identical isn't load-bearing today (the two storages never mix), but it
 * avoids two copies of the same key list silently drifting apart.
 */
export const STORAGE_KEYS = {
  bot: "chatbot-bot",
  botTimestamp: "chatbot-bot-timestamp",
  audioEnabled: "audioEnabled",
  darkMode: "darkMode",
  sessionId: "bot-session-id",
  sessionDatetime: "bot-session-datetime",
  userName: "chatbot-user-name",
  userNameGateSkipped: "chatbot-user-name-gate-skipped",
} as const;

/** Prefixes for keys that are suffixed per-character by bot name. */
export const STORAGE_KEY_PREFIXES = {
  chatHistory: "chatbot-history-",
  voiceConfig: "voiceConfig-",
  lastPlayedAudioHash: "lastPlayedAudioHash-",
} as const;

/** Per-character storage key for a bot's chat history. */
export function chatHistoryKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.chatHistory}${botName}`;
}

/** Per-character storage key for a bot's voice config. */
export function voiceConfigKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.voiceConfig}${botName}`;
}

/** Per-character storage key for the last-played audio hash (dedupe on reload). */
export function lastPlayedAudioHashKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.lastPlayedAudioHash}${botName}`;
}
