/**
 * AsyncStorage-backed persistence, mirroring the web app's localStorage usage
 * (see character-chatbot-generator/CLAUDE.md's "Client-side storage" section)
 * but for the mobile client. Key names come from the shared package so the two
 * clients can never drift on the literal string, even though the two storages
 * never actually mix.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS, chatHistoryKey, type Bot, type ChatMessage } from "character-chatbot-shared";

/** Persists the currently active character. */
export async function saveBot(bot: Bot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.bot, JSON.stringify(bot));
}

/** Loads the currently active character, or null if none is saved. */
export async function loadBot(): Promise<Bot | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.bot);
  return raw ? (JSON.parse(raw) as Bot) : null;
}

/** Appends one message to a character's stored chat history. */
export async function appendChatMessage(botName: string, message: ChatMessage): Promise<void> {
  const history = await loadChatHistory(botName);
  history.push(message);
  await AsyncStorage.setItem(chatHistoryKey(botName), JSON.stringify(history));
}

/** Loads a character's stored chat history, oldest first. */
export async function loadChatHistory(botName: string): Promise<ChatMessage[]> {
  const raw = await AsyncStorage.getItem(chatHistoryKey(botName));
  return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
}

/** Reads the visitor's own preferred name (see the web app's "Personalized greeting"). */
export async function loadUserName(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.userName);
}

/** Saves the visitor's own preferred name. */
export async function saveUserName(name: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.userName, name);
}

/** Whether the visitor has dismissed the one-time name-capture gate without naming themselves. */
export async function loadUserNameGateSkipped(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.userNameGateSkipped)) === "1";
}

/** Marks the name-capture gate as dismissed, so it won't reappear on this device. */
export async function saveUserNameGateSkipped(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.userNameGateSkipped, "1");
}

/** Whether TTS playback is on. Defaults true (unset) to match the web app. */
export async function loadAudioEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.audioEnabled);
  return raw === null ? true : raw === "true";
}

/** Persists the TTS playback on/off toggle. */
export async function saveAudioEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.audioEnabled, String(enabled));
}
