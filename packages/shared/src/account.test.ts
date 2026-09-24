import { chatStorageKeys, isChatHistoryStorageKey, isPersonalStorageKey } from "./account";
import { STORAGE_KEYS, chatHistoryKey, voiceConfigKey } from "./storageKeys";

describe("isPersonalStorageKey", () => {
  it("clears identity, chats, and game state", () => {
    for (const key of [
      STORAGE_KEYS.bot,
      STORAGE_KEYS.userName,
      STORAGE_KEYS.authToken,
      STORAGE_KEYS.gameGuestId,
      STORAGE_KEYS.gameToken,
      chatHistoryKey("Dracula"),
      voiceConfigKey("Dracula"),
    ]) {
      expect(isPersonalStorageKey(key)).toBe(true);
    }
  });

  it("keeps device preferences and unrelated keys", () => {
    for (const key of [
      STORAGE_KEYS.darkMode,
      STORAGE_KEYS.audioEnabled,
      STORAGE_KEYS.googleAnalyticsConsent,
      STORAGE_KEYS.landingCarouselCache,
      "some-other-app-key",
    ]) {
      expect(isPersonalStorageKey(key)).toBe(false);
    }
  });
});

describe("isChatHistoryStorageKey", () => {
  it("matches chats but not identity or preferences", () => {
    expect(isChatHistoryStorageKey(STORAGE_KEYS.bot)).toBe(true);
    expect(isChatHistoryStorageKey(chatHistoryKey("Zeus"))).toBe(true);
    expect(isChatHistoryStorageKey(voiceConfigKey("Zeus"))).toBe(true);
    expect(isChatHistoryStorageKey(STORAGE_KEYS.userName)).toBe(false);
    expect(isChatHistoryStorageKey(STORAGE_KEYS.darkMode)).toBe(false);
  });
});

describe("chatStorageKeys", () => {
  it("lists only that character's keys", () => {
    const keys = chatStorageKeys("Zeus");
    expect(keys).toContain(chatHistoryKey("Zeus"));
    expect(keys).toContain(voiceConfigKey("Zeus"));
    expect(keys.every((key) => key.endsWith("Zeus"))).toBe(true);
  });
});
