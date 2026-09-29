const mockPickRandomCharacterName = jest.fn();
jest.mock("../../../src/utils/pickRandomCharacterName", () => ({
  pickRandomCharacterName: (...args: unknown[]) => mockPickRandomCharacterName(...args),
}));

const mockGenerateGuessWhoSelfCluePersonaPrompt = jest.fn();
jest.mock("../../../src/config/serverConfig", () => ({
  generateGuessWhoSelfCluePersonaPrompt: (...args: unknown[]) =>
    mockGenerateGuessWhoSelfCluePersonaPrompt(...args),
}));

const mockGetOrGenerateAvatar = jest.fn();
jest.mock("../../../src/utils/avatarGeneration", () => ({
  getOrGenerateAvatar: (...args: unknown[]) => mockGetOrGenerateAvatar(...args),
}));

const mockGetOpeningReply = jest.fn();
jest.mock("../../../src/utils/guessWhoNextReply", () => ({
  getOpeningReply: (...args: unknown[]) => mockGetOpeningReply(...args),
}));

const mockGetVoiceConfigForCharacter = jest.fn();
jest.mock("../../../src/utils/characterVoices", () => ({
  getVoiceConfigForCharacter: (...args: unknown[]) => mockGetVoiceConfigForCharacter(...args),
}));

const mockSynthesizeReplyAudio = jest.fn();
jest.mock("../../../src/utils/ttsReply", () => ({
  synthesizeReplyAudio: (...args: unknown[]) => mockSynthesizeReplyAudio(...args),
}));

import { generateSelfClueRound } from "../../../src/utils/guessWhoRound";
import gameCharacterNames from "../../../src/data/gameCharacterNames";
import gameCharacterWork from "../../../src/data/gameCharacterWork";

describe("guessWhoRound / generateSelfClueRound", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickRandomCharacterName.mockReturnValue("Irene Adler");
    mockGenerateGuessWhoSelfCluePersonaPrompt.mockResolvedValue({
      prompt: "Irene Adler's self-clue persona prompt",
    });
    mockGetOrGenerateAvatar.mockResolvedValue({
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
    });
    mockGetOpeningReply.mockResolvedValue("Hello, curious one.");
    mockGetVoiceConfigForCharacter.mockResolvedValue({
      languageCodes: ["en-US"],
      name: "en-US-Wavenet-C",
      ssmlGender: "FEMALE",
    });
    mockSynthesizeReplyAudio.mockResolvedValue("/api/audio?file=opening.mp3");
  });

  it("picks a hidden name excluding excludeNames, drawing from the game's curated pool", async () => {
    await generateSelfClueRound(["Sherlock Holmes"]);
    expect(mockPickRandomCharacterName).toHaveBeenCalledWith(["Sherlock Holmes"], gameCharacterNames);
  });

  it("generates the self-clue persona prompt for the picked name, with work grounding when known", async () => {
    await generateSelfClueRound([]);
    expect(mockGenerateGuessWhoSelfCluePersonaPrompt).toHaveBeenCalledWith(
      "Irene Adler",
      gameCharacterWork["Irene Adler"],
    );
  });

  it("generates the avatar as recognized: true for the picked name", async () => {
    await generateSelfClueRound([]);
    expect(mockGetOrGenerateAvatar).toHaveBeenCalledWith("Irene Adler", { recognized: true });
  });

  it("generates the opening reply from the persona prompt", async () => {
    await generateSelfClueRound([]);
    expect(mockGetOpeningReply).toHaveBeenCalledWith("Irene Adler's self-clue persona prompt");
  });

  it("casts voice using the hidden name, its gender, and its persona prompt", async () => {
    await generateSelfClueRound([]);
    expect(mockGetVoiceConfigForCharacter).toHaveBeenCalledWith(
      "Irene Adler",
      "female",
      "Irene Adler's self-clue persona prompt",
    );
  });

  it("synthesizes TTS for the opening reply using the hidden name, gender, and voice config", async () => {
    await generateSelfClueRound([]);
    const voiceConfig = await mockGetVoiceConfigForCharacter.mock.results[0].value;
    expect(mockSynthesizeReplyAudio).toHaveBeenCalledWith(
      "Hello, curious one.",
      "Irene Adler",
      "female",
      voiceConfig,
    );
  });

  it("returns the full round shape", async () => {
    const result = await generateSelfClueRound([]);
    expect(result).toEqual({
      hiddenName: "Irene Adler",
      personaPrompt: "Irene Adler's self-clue persona prompt",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      voiceConfig: {
        languageCodes: ["en-US"],
        name: "en-US-Wavenet-C",
        ssmlGender: "FEMALE",
      },
      reply: "Hello, curious one.",
      audioFileUrl: "/api/audio?file=opening.mp3",
    });
  });

  it("fires onProgress for each stage as it completes", async () => {
    const stages: string[] = [];
    await generateSelfClueRound([], (stage) => stages.push(stage));
    expect(stages.sort()).toEqual(["avatar", "personality", "reply", "voice"]);
  });

  it("propagates an error from persona generation", async () => {
    mockGenerateGuessWhoSelfCluePersonaPrompt.mockReset();
    mockGenerateGuessWhoSelfCluePersonaPrompt.mockRejectedValueOnce(new Error("Claude is down"));
    await expect(generateSelfClueRound([])).rejects.toThrow("Claude is down");
  });

  it("propagates an error from avatar generation", async () => {
    mockGetOrGenerateAvatar.mockReset();
    mockGetOrGenerateAvatar.mockRejectedValueOnce(new Error("avatar boom"));
    await expect(generateSelfClueRound([])).rejects.toThrow("avatar boom");
  });
});
