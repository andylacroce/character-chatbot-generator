import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GUESS_WHO,
  GUESS_WHO_NEXT,
  STORAGE_KEYS,
  chatHistoryKey,
  type Bot,
  type ChatMessage,
} from "character-chatbot-shared";
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

  it("removes a retired non-persistent session and its character-scoped data", async () => {
    await saveBot({ ...bot, skipPersistence: true });
    await AsyncStorage.setItem(chatHistoryKey(bot.name), "[]");
    await AsyncStorage.setItem(`voiceConfig-${bot.name}`, "{}");
    await AsyncStorage.setItem(`lastPlayedAudioHash-${bot.name}`, "hash");

    await expect(loadBot()).resolves.toBeNull();
    await expect(AsyncStorage.getItem(STORAGE_KEYS.bot)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(chatHistoryKey(bot.name))).resolves.toBeNull();
    await expect(AsyncStorage.getItem(`voiceConfig-${bot.name}`)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(`lastPlayedAudioHash-${bot.name}`)).resolves.toBeNull();
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

  describe.each([GUESS_WHO, GUESS_WHO_NEXT])("$title run persistence", (game) => {
    const state = {
      token: "t1",
      ...(game.hidesSpeaker
        ? {}
        : { currentCharacterName: "Zeus", avatarUrl: "/silhouette.svg", gender: null }),
      streak: 2,
      messages: [{ sender: game.hidesSpeaker ? "???" : "Zeus", text: "Hail." }],
      roundStartIndex: 0,
      lastEvent: null,
    };

    it("saves, loads and clears an in-progress run", async () => {
      expect(await loadGameState(game)).toBeNull();
      await saveGameState(game, state);
      expect(await loadGameState(game)).toEqual(state);
      await saveGameState(game, null);
      expect(await loadGameState(game)).toBeNull();
    });

    it("keeps the token and transcript under this game's own keys, the layout earlier builds wrote", async () => {
      await saveGameState(game, state);
      expect(await AsyncStorage.getItem(game.storageKeys.token)).toBe("t1");
      const { token, ...rest } = state;
      expect(token).toBe("t1");
      expect(JSON.parse((await AsyncStorage.getItem(game.storageKeys.transcript))!)).toEqual(rest);
    });

    it("never touches the other game's run", async () => {
      const other = game === GUESS_WHO ? GUESS_WHO_NEXT : GUESS_WHO;
      await saveGameState(game, state);
      expect(await loadGameState(other)).toBeNull();
    });

    it("remembers that the instructions were seen, per game", async () => {
      expect(await loadGameInstructionsSeen(game)).toBe(false);
      await saveGameInstructionsSeen(game);
      expect(await loadGameInstructionsSeen(game)).toBe(true);
    });
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
