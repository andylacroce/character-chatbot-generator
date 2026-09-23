/**
 * Single source of truth for client-storage key names, used by the web app's
 * localStorage and the mobile app's AsyncStorage alike, so a read site and a write
 * site can never drift apart on the literal string.
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
  /** Bearer JWT from the mobile-auth-start/-complete sign-in bridge — mobile-only, kept in expo-secure-store, never AsyncStorage. */
  authToken: "chatbot-auth-token",
  /** Mobile's own guest game identity — the equivalent of the web's HttpOnly `portrayal-game-guest` cookie, which a native client can't reliably persist. Kept in expo-secure-store. */
  gameGuestId: "chatbot-game-guest-id",
  /** One-time "how to play" gate for the guessing game, mirrors the web's own gameInstructionsSeen key. */
  gameInstructionsSeen: "chatbot-game-instructions-seen",
  /** The guessing game's opaque round token (never decoded client-side), mirrors the web's own key. */
  gameToken: "chatbot-game-token",
  /** The guessing game's transcript and round state, stored alongside `gameToken`. */
  gameTranscript: "chatbot-game-transcript",
  /** The web landing carousel's last portrait sample, repainted instantly on the next visit. */
  landingCarouselCache: "chatbot-landing-carousel-cache",
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
