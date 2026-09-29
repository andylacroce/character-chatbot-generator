import { getValidBotFromStorage } from "../../src/utils/getValidBotFromStorage";

describe("getValidBotFromStorage", () => {
  const bot = { name: "Test", personality: "fun", avatarUrl: "url", voiceConfig: null };
  const sixHours = 6 * 60 * 60 * 1000;

  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns bot if not expired", () => {
    localStorage.setItem("chatbot-bot", JSON.stringify(bot));
    localStorage.setItem("chatbot-bot-timestamp", Date.now().toString());
    expect(getValidBotFromStorage()).toEqual(bot);
  });

  it("removes a retired non-persistent session and its character-scoped data", () => {
    const retiredBot = { ...bot, skipPersistence: true };
    localStorage.setItem("chatbot-bot", JSON.stringify(retiredBot));
    localStorage.setItem("chatbot-bot-timestamp", Date.now().toString());
    localStorage.setItem("chatbot-history-Test", "[]");
    localStorage.setItem("voiceConfig-Test", "{}");
    localStorage.setItem("lastPlayedAudioHash-Test", "hash");

    expect(getValidBotFromStorage()).toBeNull();
    expect(localStorage.getItem("chatbot-bot")).toBeNull();
    expect(localStorage.getItem("chatbot-bot-timestamp")).toBeNull();
    expect(localStorage.getItem("chatbot-history-Test")).toBeNull();
    expect(localStorage.getItem("voiceConfig-Test")).toBeNull();
    expect(localStorage.getItem("lastPlayedAudioHash-Test")).toBeNull();
  });

  it("removes and returns null if expired", () => {
    localStorage.setItem("chatbot-bot", JSON.stringify(bot));
    localStorage.setItem("chatbot-bot-timestamp", (Date.now() - sixHours - 1000).toString());
    expect(getValidBotFromStorage()).toBeNull();
    expect(localStorage.getItem("chatbot-bot")).toBeNull();
    expect(localStorage.getItem("chatbot-bot-timestamp")).toBeNull();
  });

  it("removes and returns null if timestamp missing", () => {
    localStorage.setItem("chatbot-bot", JSON.stringify(bot));
    expect(getValidBotFromStorage()).toBeNull();
    expect(localStorage.getItem("chatbot-bot")).toBeNull();
    expect(localStorage.getItem("chatbot-bot-timestamp")).toBeNull();
  });

  it("removes and returns null if bot missing", () => {
    localStorage.setItem("chatbot-bot-timestamp", Date.now().toString());
    expect(getValidBotFromStorage()).toBeNull();
    expect(localStorage.getItem("chatbot-bot")).toBeNull();
    expect(localStorage.getItem("chatbot-bot-timestamp")).toBeNull();
  });
});
