const mockPickRandomCharacterName = jest.fn();
jest.mock("../../../../src/utils/pickRandomCharacterName", () => ({
  pickRandomCharacterName: (...args: unknown[]) => mockPickRandomCharacterName(...args),
}));

const mockSelfCluePersona = jest.fn();
const mockCluePersona = jest.fn();
jest.mock("../../../../src/config/serverConfig", () => ({
  generateGuessWhoSelfCluePersonaPrompt: (...args: unknown[]) => mockSelfCluePersona(...args),
  generateGameCluePersonaPrompt: (...args: unknown[]) => mockCluePersona(...args),
}));

const mockGetOrGenerateAvatar = jest.fn();
jest.mock("../../../../src/utils/avatarGeneration", () => ({
  getOrGenerateAvatar: (...args: unknown[]) => mockGetOrGenerateAvatar(...args),
}));

const mockGetOpeningReply = jest.fn();
jest.mock("../../../../src/utils/gameReply", () => ({
  getOpeningReply: (...args: unknown[]) => mockGetOpeningReply(...args),
  SELF_CLUE_OPENING_INSTRUCTION: "__SELF_CLUE_OPENING_INSTRUCTION__",
}));

const mockGetVoiceConfigForCharacter = jest.fn();
jest.mock("../../../../src/utils/characterVoices", () => ({
  getVoiceConfigForCharacter: (...args: unknown[]) => mockGetVoiceConfigForCharacter(...args),
}));

const mockSynthesizeReplyAudio = jest.fn();
jest.mock("../../../../src/utils/ttsReply", () => ({
  synthesizeReplyAudio: (...args: unknown[]) => mockSynthesizeReplyAudio(...args),
}));

import { generateGameRound, planRound } from "../../../../src/utils/game/round";
import { getServerGame } from "../../../../src/utils/game/definitions";
import gameCharacterNames from "../../../../src/data/gameCharacterNames";
import gameCharacterWork from "../../../../src/data/gameCharacterWork";

const guessWho = getServerGame("guess-who")!;
const guessWhoNext = getServerGame("guess-who-next")!;

describe("planRound", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("Guess Who (hidden speaker)", () => {
    it("picks a mystery that speaks for itself, from the curated pool, excluding names already met", () => {
      mockPickRandomCharacterName.mockReturnValue("Irene Adler");
      expect(planRound(guessWho, { targetName: "Zeus", usedNames: ["Zeus"] })).toEqual({
        speakerName: "Irene Adler",
        targetName: "Irene Adler",
        usedNames: ["Zeus", "Irene Adler"],
      });
      expect(mockPickRandomCharacterName).toHaveBeenCalledWith(["Zeus"], gameCharacterNames);
    });

    it("starts a run with nothing excluded", () => {
      mockPickRandomCharacterName.mockReturnValue("Irene Adler");
      expect(planRound(guessWho).usedNames).toEqual(["Irene Adler"]);
      expect(mockPickRandomCharacterName).toHaveBeenCalledWith([], gameCharacterNames);
    });
  });

  describe("Guess Who's Next (shown speaker)", () => {
    it("starts a run with a named speaker and a different, hidden target", () => {
      mockPickRandomCharacterName
        .mockReturnValueOnce("Sherlock Holmes")
        .mockReturnValueOnce("Irene Adler");
      expect(planRound(guessWhoNext)).toEqual({
        speakerName: "Sherlock Holmes",
        targetName: "Irene Adler",
        usedNames: ["Sherlock Holmes"],
      });
      expect(mockPickRandomCharacterName).toHaveBeenLastCalledWith(
        ["Sherlock Holmes"],
        gameCharacterNames,
      );
    });

    it("promotes the just-revealed target to speaker and excludes it from the next pick", () => {
      mockPickRandomCharacterName.mockReturnValue("Zeus");
      expect(
        planRound(guessWhoNext, {
          targetName: "Irene Adler",
          usedNames: ["Sherlock Holmes"],
        }),
      ).toEqual({
        speakerName: "Irene Adler",
        targetName: "Zeus",
        usedNames: ["Sherlock Holmes", "Irene Adler"],
      });
      expect(mockPickRandomCharacterName).toHaveBeenCalledWith(
        ["Sherlock Holmes", "Irene Adler"],
        gameCharacterNames,
      );
    });
  });
});

describe("generateGameRound", () => {
  const voiceConfig = { languageCodes: ["en-US"], name: "en-US-Wavenet-C", ssmlGender: "FEMALE" };

  beforeEach(() => {
    jest.resetAllMocks();
    mockSelfCluePersona.mockResolvedValue({ prompt: "self-clue persona" });
    mockCluePersona.mockResolvedValue({ prompt: "steering persona" });
    mockGetOrGenerateAvatar.mockResolvedValue({
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
    });
    mockGetOpeningReply.mockResolvedValue("Hello, curious one.");
    mockGetVoiceConfigForCharacter.mockResolvedValue(voiceConfig);
    mockSynthesizeReplyAudio.mockResolvedValue("/api/audio?file=opening.mp3");
  });

  it("Guess Who: builds the self-clue persona with work grounding and the self-clue opening", async () => {
    await generateGameRound(guessWho, {
      speakerName: "Irene Adler",
      targetName: "Irene Adler",
      usedNames: ["Irene Adler"],
    });
    expect(mockSelfCluePersona).toHaveBeenCalledWith(
      "Irene Adler",
      gameCharacterWork["Irene Adler"],
    );
    expect(mockGetOpeningReply).toHaveBeenCalledWith(
      "self-clue persona",
      "__SELF_CLUE_OPENING_INSTRUCTION__",
    );
  });

  it("Guess Who's Next: builds the steering persona grounded in both names, with the default opening", async () => {
    await generateGameRound(guessWhoNext, {
      speakerName: "Sherlock Holmes",
      targetName: "Irene Adler",
      usedNames: ["Sherlock Holmes"],
    });
    expect(mockCluePersona).toHaveBeenCalledWith("Sherlock Holmes", "Irene Adler", {
      current: gameCharacterWork["Sherlock Holmes"],
      next: gameCharacterWork["Irene Adler"],
    });
    expect(mockGetOpeningReply).toHaveBeenCalledWith("steering persona", undefined);
  });

  it("generates avatar, voice and TTS for the SPEAKER, never the hidden target", async () => {
    await generateGameRound(guessWhoNext, {
      speakerName: "Sherlock Holmes",
      targetName: "Irene Adler",
      usedNames: [],
    });
    expect(mockGetOrGenerateAvatar).toHaveBeenCalledWith("Sherlock Holmes");
    expect(mockGetVoiceConfigForCharacter).toHaveBeenCalledWith(
      "Sherlock Holmes",
      "female",
      "steering persona",
    );
    expect(mockSynthesizeReplyAudio).toHaveBeenCalledWith(
      "Hello, curious one.",
      "Sherlock Holmes",
      "female",
      voiceConfig,
    );
  });

  it("returns the full round shape", async () => {
    await expect(
      generateGameRound(guessWho, {
        speakerName: "Irene Adler",
        targetName: "Irene Adler",
        usedNames: [],
      }),
    ).resolves.toEqual({
      personaPrompt: "self-clue persona",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      voiceConfig,
      reply: "Hello, curious one.",
      audioFileUrl: "/api/audio?file=opening.mp3",
    });
  });

  it("fires onProgress for each stage as it completes", async () => {
    const stages: string[] = [];
    await generateGameRound(
      guessWho,
      { speakerName: "Irene Adler", targetName: "Irene Adler", usedNames: [] },
      (stage) => stages.push(stage),
    );
    expect(stages.sort()).toEqual(["avatar", "personality", "reply", "voice"]);
  });

  it.each([
    ["persona generation", () => mockSelfCluePersona.mockRejectedValueOnce(new Error("boom"))],
    ["avatar generation", () => mockGetOrGenerateAvatar.mockRejectedValueOnce(new Error("boom"))],
  ])("propagates an error from %s", async (_name, fail) => {
    fail();
    await expect(
      generateGameRound(guessWho, {
        speakerName: "Irene Adler",
        targetName: "Irene Adler",
        usedNames: [],
      }),
    ).rejects.toThrow("boom");
  });
});
