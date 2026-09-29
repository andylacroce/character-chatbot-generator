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
  /** One-time "how to play" gate for "Guess Who's Next", mirrors the web's own key. Renamed 2026-09-28 alongside the old game's full internal rename — an in-flight value under the old key string is simply not read again, so this just re-shows the modal once, same low-stakes degrade as a secret rotation elsewhere in this app. */
  guessWhoNextInstructionsSeen: "chatbot-guess-who-next-instructions-seen",
  /** "Guess Who's Next"'s opaque round token (never decoded client-side), mirrors the web's own key. Renamed 2026-09-28 — an in-flight round token under the old key string is simply lost once, same "please start a new game" degrade as a secret rotation elsewhere in this app. */
  guessWhoNextToken: "chatbot-guess-who-next-token",
  /** "Guess Who's Next"'s transcript and round state, stored alongside `guessWhoNextToken`. */
  guessWhoNextTranscript: "chatbot-guess-who-next-transcript",
  /** The web landing carousel's last portrait sample, repainted instantly on the next visit. */
  landingCarouselCache: "chatbot-landing-carousel-cache",
  /** Web-only opt-in preference for loading Google Analytics. */
  googleAnalyticsConsent: "portrayal-google-analytics-consent",
  /** One-time "how to play" gate for "Guess Who" (the self-describing chat game), mirrors the web's own key. */
  guessWhoInstructionsSeen: "chatbot-guess-who-instructions-seen",
  /** "Guess Who"'s opaque round token (never decoded client-side). */
  guessWhoToken: "chatbot-guess-who-token",
  /** "Guess Who"'s transcript and round state, stored alongside `guessWhoToken`. */
  guessWhoTranscript: "chatbot-guess-who-transcript",
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
