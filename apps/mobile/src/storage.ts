/**
 * AsyncStorage-backed persistence, mirroring the web app's localStorage usage
 * (see character-chatbot-generator/CLAUDE.md's "Client-side storage" section)
 * but for the mobile client. Key names come from the shared package so the two
 * clients can never drift on the literal string, even though the two storages
 * never actually mix.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STORAGE_KEYS,
  chatHistoryKey,
  isPersonalStorageKey,
  isChatHistoryStorageKey,
  chatStorageKeys,
  type Bot,
  type CarouselCache,
  type CharacterEntry,
  type ChatMessage,
  type PersistedGameState,
  type PersistedGuessWhoState,
} from "character-chatbot-shared";

/** Persists the currently active character. */
export async function saveBot(bot: Bot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.bot, JSON.stringify(bot));
}

/** Loads the currently active character, or null if none is saved. */
export async function loadBot(): Promise<Bot | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.bot);
  if (!raw) return null;
  const bot = JSON.parse(raw) as Bot;
  // Original characters and copyright-warning overrides used the same deliberately
  // ephemeral marker. Remove those retired sessions and their character-scoped data.
  if (bot.skipPersistence) {
    await AsyncStorage.multiRemove([...chatStorageKeys(bot.name), STORAGE_KEYS.bot]);
    return null;
  }
  return bot;
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

/** Loads an in-progress guessing-game run, or null if there isn't one. */
export async function loadGameState(): Promise<PersistedGameState | null> {
  const [gameToken, rest] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.guessWhoNextToken),
    AsyncStorage.getItem(STORAGE_KEYS.guessWhoNextTranscript),
  ]);
  if (!gameToken || !rest) return null;
  return { gameToken, ...(JSON.parse(rest) as Omit<PersistedGameState, "gameToken">) };
}

/** Persists the current run, or clears it when `state` is null. */
export async function saveGameState(state: PersistedGameState | null): Promise<void> {
  if (!state) {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.guessWhoNextToken),
      AsyncStorage.removeItem(STORAGE_KEYS.guessWhoNextTranscript),
    ]);
    return;
  }
  const { gameToken, ...rest } = state;
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.guessWhoNextToken, gameToken),
    AsyncStorage.setItem(STORAGE_KEYS.guessWhoNextTranscript, JSON.stringify(rest)),
  ]);
}

/** Whether the one-time "how to play" explainer has been shown on this device. */
export async function loadGameInstructionsSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.guessWhoNextInstructionsSeen)) === "true";
}

/** Marks the "how to play" explainer as seen. */
export async function saveGameInstructionsSeen(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.guessWhoNextInstructionsSeen, "true");
}

/** Loads an in-progress "Guess Who" run, or null if there isn't one. */
export async function loadGuessWhoState(): Promise<PersistedGuessWhoState | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.guessWhoState);
  return raw ? (JSON.parse(raw) as PersistedGuessWhoState) : null;
}

/** Persists the current "Guess Who" run, or clears it when `state` is null. */
export async function saveGuessWhoState(state: PersistedGuessWhoState | null): Promise<void> {
  if (!state) {
    await AsyncStorage.removeItem(STORAGE_KEYS.guessWhoState);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.guessWhoState, JSON.stringify(state));
}

/** Whether "Guess Who"'s one-time "how to play" explainer has been shown on this device. */
export async function loadGuessWhoInstructionsSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.guessWhoInstructionsSeen)) === "true";
}

/** Marks "Guess Who"'s "how to play" explainer as seen. */
export async function saveGuessWhoInstructionsSeen(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.guessWhoInstructionsSeen, "true");
}

/** The landing carousel's last portrait sample, repainted instantly on the next launch. */
export const carouselCache: CarouselCache = {
  load: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.landingCarouselCache);
    return raw ? (JSON.parse(raw) as CharacterEntry[]) : null;
  },
  save: (characters) =>
    AsyncStorage.setItem(STORAGE_KEYS.landingCarouselCache, JSON.stringify(characters)),
};

/** Removes every personal key (chats, characters, name, game state) after account deletion; keeps device preferences. */
export async function clearPersonalData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(isPersonalStorageKey));
}

/** Removes one character's local chat (by name), or every local chat when no name is given. */
export async function clearLocalChats(botName?: string): Promise<void> {
  if (botName === undefined) {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(isChatHistoryStorageKey));
    return;
  }
  const keys = chatStorageKeys(botName);
  if ((await loadBot())?.name === botName) keys.push(STORAGE_KEYS.bot);
  await AsyncStorage.multiRemove(keys);
}
