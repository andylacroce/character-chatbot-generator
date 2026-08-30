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
} as const;

/** Prefixes for keys that are suffixed per-character by bot name. */
export const STORAGE_KEY_PREFIXES = {
  chatHistory: "chatbot-history-",
  voiceConfig: "voiceConfig-",
  lastPlayedAudioHash: "lastPlayedAudioHash-",
} as const;

export function chatHistoryKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.chatHistory}${botName}`;
}

export function voiceConfigKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.voiceConfig}${botName}`;
}

export function lastPlayedAudioHashKey(botName: string): string {
  return `${STORAGE_KEY_PREFIXES.lastPlayedAudioHash}${botName}`;
}
