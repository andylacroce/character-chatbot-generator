import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS, chatHistoryKey, type Bot, type ChatMessage } from "character-chatbot-shared";
import {
  appendChatMessage,
  clearLocalChats,
  clearPersonalData,
  loadAudioEnabled,
  loadBot,
  loadChatHistory,
  loadGameInstructionsSeen,
  loadGameState,
  loadUserName,
  loadUserNameGateSkipped,
  saveAudioEnabled,
  saveBot,
  saveGameInstructionsSeen,
  saveGameState,
  saveUserName,
  saveUserNameGateSkipped,
} from "../src/storage";

const bot: Bot = {
  name: "Sherlock Holmes",
  personality: "A brilliant detective.",
  avatarUrl: "https://example.com/avatar.png",
  voiceConfig: null,
  gender: "male",
};

describe("storage", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("saves and loads the active bot", async () => {
    await saveBot(bot);
    await expect(loadBot()).resolves.toEqual(bot);
  });

  it("returns null when no bot is saved", async () => {
    await expect(loadBot()).resolves.toBeNull();
  });

  it("appends messages to a character's chat history in order", async () => {
    const first: ChatMessage = { sender: "Me", text: "Hello" };
    const second: ChatMessage = { sender: bot.name, text: "Greetings." };

    await appendChatMessage(bot.name, first);
    await appendChatMessage(bot.name, second);

    await expect(loadChatHistory(bot.name)).resolves.toEqual([first, second]);
  });

  it("returns an empty history for a character with none saved", async () => {
    await expect(loadChatHistory("Nobody")).resolves.toEqual([]);
  });

  it("stores chat history under the shared chatHistoryKey", async () => {
    const message: ChatMessage = { sender: "Me", text: "Hi" };
    await appendChatMessage(bot.name, message);
    const raw = await AsyncStorage.getItem(chatHistoryKey(bot.name));
    expect(JSON.parse(raw!)).toEqual([message]);
  });

  it("saves and loads the visitor's preferred name", async () => {
    await saveUserName("Andy");
    await expect(loadUserName()).resolves.toBe("Andy");
  });

  it("returns null for the user name when never set", async () => {
    await expect(loadUserName()).resolves.toBeNull();
  });

  it("tracks whether the name-capture gate was skipped", async () => {
    await expect(loadUserNameGateSkipped()).resolves.toBe(false);
    await saveUserNameGateSkipped();
    await expect(loadUserNameGateSkipped()).resolves.toBe(true);
  });

  it("defaults audio enabled to true when never set", async () => {
    await expect(loadAudioEnabled()).resolves.toBe(true);
  });

  it("persists the audio enabled toggle in both directions", async () => {
    await saveAudioEnabled(false);
    await expect(loadAudioEnabled()).resolves.toBe(false);
    await saveAudioEnabled(true);
    await expect(loadAudioEnabled()).resolves.toBe(true);
  });

  it("writes the user name under the shared STORAGE_KEYS.userName key", async () => {
    await saveUserName("Jane");
    await expect(AsyncStorage.getItem(STORAGE_KEYS.userName)).resolves.toBe("Jane");
  });

  it("saves, loads and clears an in-progress game run", async () => {
    const state = {
      gameToken: "t1",
      currentCharacterName: "Zeus",
      avatarUrl: "/silhouette.svg",
      gender: null,
      streak: 2,
      messages: [{ sender: "Zeus", text: "Hail." }],
      roundStartIndex: 0,
      lastEvent: null,
    };
    expect(await loadGameState()).toBeNull();
    await saveGameState(state);
    expect(await loadGameState()).toEqual(state);
    await saveGameState(null);
    expect(await loadGameState()).toBeNull();
  });

  it("remembers that the game instructions were seen", async () => {
    expect(await loadGameInstructionsSeen()).toBe(false);
    await saveGameInstructionsSeen();
    expect(await loadGameInstructionsSeen()).toBe(true);
  });

  it("clearPersonalData removes chats and identity but keeps device preferences", async () => {
    await saveUserName("Jane");
    await AsyncStorage.setItem(chatHistoryKey("Zeus"), "[]");
    await saveAudioEnabled(false);
    await clearPersonalData();
    expect(await loadUserName()).toBeNull();
    expect(await AsyncStorage.getItem(chatHistoryKey("Zeus"))).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.audioEnabled)).not.toBeNull();
  });

  it("clearLocalChats removes one character's chat, or all chats", async () => {
    await AsyncStorage.setItem(chatHistoryKey("Zeus"), "[]");
    await AsyncStorage.setItem(chatHistoryKey("Hera"), "[]");
    await saveUserName("Jane");

    await clearLocalChats("Zeus");
    expect(await AsyncStorage.getItem(chatHistoryKey("Zeus"))).toBeNull();
    expect(await AsyncStorage.getItem(chatHistoryKey("Hera"))).toBe("[]");

    await clearLocalChats();
    expect(await AsyncStorage.getItem(chatHistoryKey("Hera"))).toBeNull();
    expect(await loadUserName()).toBe("Jane");
  });
});
