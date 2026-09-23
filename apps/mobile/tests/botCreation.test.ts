import type { Bot } from "character-chatbot-shared";

jest.mock("../src/api", () => ({
  generateAvatar: jest.fn(),
  generatePersonality: jest.fn(),
  getRandomCharacter: jest.fn(),
  getVoiceConfig: jest.fn(),
  persistBot: jest.fn(),
  validateCharacter: jest.fn(),
}));
jest.mock("../src/authToken", () => ({
  getCachedAuthToken: jest.fn(),
}));

import {
  generateAvatar,
  generatePersonality,
  getRandomCharacter,
  getVoiceConfig,
  persistBot,
  validateCharacter,
} from "../src/api";
import { getCachedAuthToken } from "../src/authToken";
import { mobileTransport, persistBotIfSignedIn } from "../src/botCreation";

describe("mobileTransport", () => {
  const failOpen = expect.objectContaining({ warningLevel: "none", recognized: true });

  it("passes validation results through", async () => {
    const result = { characterName: "Zeus", warningLevel: "caution" };
    (validateCharacter as jest.Mock).mockResolvedValue(result);
    await expect(mobileTransport.validate("Zeus")).resolves.toBe(result);
  });

  it("fails validation open on an empty reply or an error", async () => {
    (validateCharacter as jest.Mock).mockResolvedValueOnce(null);
    await expect(mobileTransport.validate("Zeus")).resolves.toEqual(failOpen);
    (validateCharacter as jest.Mock).mockRejectedValueOnce(new Error("down"));
    await expect(mobileTransport.validate("Zeus")).resolves.toEqual(failOpen);
  });

  it("returns a random name, falling back to a default on error", async () => {
    (getRandomCharacter as jest.Mock).mockResolvedValueOnce({ name: "Beowulf" });
    await expect(mobileTransport.randomName()).resolves.toBe("Beowulf");
    (getRandomCharacter as jest.Mock).mockRejectedValueOnce(new Error("down"));
    await expect(mobileTransport.randomName()).resolves.toBe("Sherlock Holmes");
  });

  it("turns personality/avatar failures into null so the pipeline degrades", async () => {
    (generatePersonality as jest.Mock).mockRejectedValue(new Error("down"));
    (generateAvatar as jest.Mock).mockRejectedValue(new Error("down"));
    await expect(mobileTransport.generatePersonality({ name: "Zeus" })).resolves.toBeNull();
    await expect(
      mobileTransport.generateAvatar({ name: "Zeus", skipPersistence: false, recognized: true }),
    ).resolves.toBeNull();
  });

  it("forwards voice config requests", async () => {
    (getVoiceConfig as jest.Mock).mockResolvedValue({ name: "en-GB-Standard-B" });
    await expect(mobileTransport.getVoiceConfig("Zeus", "male")).resolves.toEqual({
      name: "en-GB-Standard-B",
    });
    expect(getVoiceConfig).toHaveBeenCalledWith("Zeus", "male");
  });
});

describe("persistBotIfSignedIn", () => {
  const bot: Bot = {
    name: "Zeus",
    personality: "p",
    avatarUrl: "https://example.com/a.png",
    voiceConfig: null,
    gender: "male",
  };

  it("does nothing for a skipPersistence bot", () => {
    (getCachedAuthToken as jest.Mock).mockReturnValue("token");
    persistBotIfSignedIn({ ...bot, skipPersistence: true });
    expect(persistBot).not.toHaveBeenCalled();
  });

  it("does nothing when signed out (no cached token)", () => {
    (getCachedAuthToken as jest.Mock).mockReturnValue(null);
    persistBotIfSignedIn(bot);
    expect(persistBot).not.toHaveBeenCalled();
  });

  it("persists the bot when signed in", () => {
    (getCachedAuthToken as jest.Mock).mockReturnValue("token");
    (persistBot as jest.Mock).mockResolvedValue({ persisted: true });
    persistBotIfSignedIn(bot);
    expect(persistBot).toHaveBeenCalledWith({
      name: "Zeus",
      personality: "p",
      avatarUrl: "https://example.com/a.png",
      gender: "male",
      voiceConfig: null,
    });
  });

  it("swallows a persistence failure (fire-and-forget)", async () => {
    (getCachedAuthToken as jest.Mock).mockReturnValue("token");
    (persistBot as jest.Mock).mockRejectedValue(new Error("network down"));
    expect(() => persistBotIfSignedIn(bot)).not.toThrow();
    await Promise.resolve();
  });
});
