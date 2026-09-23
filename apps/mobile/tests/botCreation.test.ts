import type { Bot } from "character-chatbot-shared";

jest.mock("../src/api", () => ({
  generateAvatar: jest.fn(),
  generatePersonality: jest.fn(),
  getVoiceConfig: jest.fn(),
  persistBot: jest.fn(),
}));
jest.mock("../src/authToken", () => ({
  getCachedAuthToken: jest.fn(),
}));

import { generateAvatar, generatePersonality, getVoiceConfig, persistBot } from "../src/api";
import { getCachedAuthToken } from "../src/authToken";
import { createBot, persistBotIfSignedIn } from "../src/botCreation";

const notCancelled = () => false;

describe("createBot", () => {
  beforeEach(() => {
    (generatePersonality as jest.Mock).mockResolvedValue({
      personality: "A brilliant detective.",
      correctedName: "Sherlock Holmes",
    });
    (generateAvatar as jest.Mock).mockResolvedValue({
      avatarUrl: "https://example.com/a.png",
      gender: "male",
    });
    (getVoiceConfig as jest.Mock).mockResolvedValue({ name: "en-GB-Standard-B" });
  });

  it("runs personality -> avatar -> voice in order and reports progress", async () => {
    const onProgress = jest.fn();
    const bot = await createBot("sherlock", onProgress, notCancelled);

    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      "Creating personality",
      "Generating portrait",
      "Selecting voice",
    ]);
    expect(bot).toEqual<Bot>({
      name: "Sherlock Holmes",
      personality: "A brilliant detective.",
      avatarUrl: "https://example.com/a.png",
      voiceConfig: { name: "en-GB-Standard-B" } as never,
      gender: "male",
      skipPersistence: undefined,
    });
  });

  it("uses generatePersonality's correctedName for the avatar/voice calls", async () => {
    await createBot("sherlok holmes", jest.fn(), notCancelled);
    expect(generateAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sherlock Holmes" }),
    );
    expect(getVoiceConfig).toHaveBeenCalledWith("Sherlock Holmes", "male");
  });

  it("forwards description/appearance/skipPersistence/recognized options", async () => {
    await createBot("Original Character", jest.fn(), notCancelled, {
      description: "A time traveler.",
      appearanceDescription: "Wears a long coat.",
      skipPersistence: true,
      recognized: false,
    });

    expect(generatePersonality).toHaveBeenCalledWith({
      name: "Original Character",
      description: "A time traveler.",
    });
    expect(generateAvatar).toHaveBeenCalledWith({
      name: "Sherlock Holmes",
      skipPersistence: true,
      recognized: false,
      appearanceDescription: "Wears a long coat.",
    });
  });

  it("defaults recognized to true when not given", async () => {
    await createBot("Zeus", jest.fn(), notCancelled);
    expect(generateAvatar).toHaveBeenCalledWith(expect.objectContaining({ recognized: true }));
  });

  it("stops after the personality step when cancelled", async () => {
    const result = await createBot("Zeus", jest.fn(), () => true);
    expect(result).toBeNull();
    expect(generateAvatar).not.toHaveBeenCalled();
  });

  it("stops after the avatar step when cancelled mid-pipeline", async () => {
    let calls = 0;
    const isCancelled = () => {
      calls += 1;
      // First check (after personality) says "not yet"; second (after avatar) says "stop".
      return calls > 1;
    };
    const result = await createBot("Zeus", jest.fn(), isCancelled);
    expect(result).toBeNull();
    expect(getVoiceConfig).not.toHaveBeenCalled();
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
