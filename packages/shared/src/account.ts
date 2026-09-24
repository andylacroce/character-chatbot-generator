import {
  STORAGE_KEYS,
  STORAGE_KEY_PREFIXES,
  chatHistoryKey,
  lastPlayedAudioHashKey,
  voiceConfigKey,
} from "./storageKeys";

/** Copy for the "Delete account" confirmation, shared by web and mobile. */
export const ACCOUNT_DELETE_CONFIRM = {
  title: "Delete your account?",
  body: "This permanently erases your account, saved characters, chat history, preferred name, and game scores. It can't be undone.",
  confirmLabel: "Delete account",
  cancelLabel: "Cancel",
  errorMessage: "Couldn't delete your account. Please try again.",
} as const;

// Device preferences that aren't about the person: kept after account deletion.
const DEVICE_PREFERENCE_KEYS: readonly string[] = [
  STORAGE_KEYS.darkMode,
  STORAGE_KEYS.audioEnabled,
  STORAGE_KEYS.googleAnalyticsConsent,
  STORAGE_KEYS.landingCarouselCache,
];

const PERSONAL_KEYS = new Set<string>(
  Object.values(STORAGE_KEYS).filter((key) => !DEVICE_PREFERENCE_KEYS.includes(key)),
);

/** Whether a client storage key holds personal data that account deletion must also clear. */
export function isPersonalStorageKey(key: string): boolean {
  return (
    PERSONAL_KEYS.has(key) ||
    Object.values(STORAGE_KEY_PREFIXES).some((prefix) => key.startsWith(prefix))
  );
}

/** Copy for the Past chats "Clear chat history" confirmation, shared by web and mobile. */
export const CLEAR_HISTORY_CONFIRM = {
  title: "Clear your chat history?",
  body: "This permanently deletes every saved character and conversation on your account. It can't be undone.",
  confirmLabel: "Clear history",
  cancelLabel: "Cancel",
  errorMessage: "Couldn't clear your chat history. Please try again.",
} as const;

/** Whether a client storage key holds a chat (active character, per-character history or voice) that clearing history must remove. */
export function isChatHistoryStorageKey(key: string): boolean {
  return (
    key === STORAGE_KEYS.bot ||
    key === STORAGE_KEYS.botTimestamp ||
    Object.values(STORAGE_KEY_PREFIXES).some((prefix) => key.startsWith(prefix))
  );
}

/** Copy for deleting one saved chat. `{name}` is a placeholder for the character's display name. */
export const DELETE_CHAT_CONFIRM = {
  title: "Delete your chat with {name}?",
  body: "This permanently deletes this character and your conversation with it. It can't be undone.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  errorMessage: "Couldn't delete this chat. Please try again.",
} as const;

/** Every client storage key holding one character's chat, for deleting that single chat locally. */
export function chatStorageKeys(botName: string): string[] {
  return [chatHistoryKey(botName), voiceConfigKey(botName), lastPlayedAudioHashKey(botName)];
}
