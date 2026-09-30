import { verifyGameState } from "../../../../src/utils/game/token";
import gameCharacterNames from "../../../../src/data/gameCharacterNames";
import {
  GAMES_UNDER_TEST,
  makeReq,
  makeRes,
  sentJson,
  sseFrames,
} from "../../../helpers/gameRoute";

const mockLogEvent = jest.fn();
jest.mock("../../../../src/utils/logger", () => ({
  __esModule: true,
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
  generateRequestId: () => "test-id",
}));

const mockApplyRateLimit = jest.fn();
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => options,
  applyRateLimit: (...args: unknown[]) => mockApplyRateLimit(...args),
}));

jest.mock("../../../../src/utils/environment", () => ({ getCurrentEnvironment: () => "test" }));

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockEnsureGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  ensureGuestId: (...args: unknown[]) => mockEnsureGuestId(...args),
}));

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

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

const handler = require("../../../../src/pages/api/[game]/start").default;

describe.each(GAMES_UNDER_TEST)("$slug/start API", (game) => {
  const prefix = game.eventPrefix;
  // Guess Who picks one mystery that speaks for itself; Guess Who's Next picks a named
  // speaker, then a different hidden target.
  const speaker = game.hidesSpeaker ? "Irene Adler" : "Sherlock Holmes";
  const personaMock = game.hidesSpeaker ? mockSelfCluePersona : mockCluePersona;

  async function start(body?: Record<string, unknown>, method = "POST") {
    const res = makeRes();
    await handler(makeReq(game, body, method), res);
    return res;
  }

  beforeEach(() => {
    jest.resetAllMocks();
    mockApplyRateLimit.mockResolvedValue(true);
    mockGetSessionUserId.mockResolvedValue(null);
    mockEnsureGuestId.mockReturnValue("guest-hash");
    if (game.hidesSpeaker) {
      mockPickRandomCharacterName.mockReturnValueOnce("Irene Adler");
    } else {
      mockPickRandomCharacterName
        .mockReturnValueOnce("Sherlock Holmes")
        .mockReturnValueOnce("Irene Adler");
    }
    personaMock.mockResolvedValue({ prompt: "persona prompt here" });
    mockGetOrGenerateAvatar.mockResolvedValue({
      avatarUrl: "https://example.com/avatar.png",
      gender: "male",
    });
    mockGetOpeningReply.mockResolvedValue("Hello, detective.");
    mockGetVoiceConfigForCharacter.mockResolvedValue({
      languageCodes: ["en-GB"],
      name: "en-GB-Wavenad-D",
      ssmlGender: "MALE",
    });
    mockSynthesizeReplyAudio.mockResolvedValue("/api/audio?file=test.mp3");
  });

  it("applies this game's own rate limiter", async () => {
    await start();
    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${game.slug}-start`, max: 10 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 405 for non-POST methods", async () => {
    const res = await start(undefined, "GET");
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns the opening round with the token under the game's wire name", async () => {
    const res = await start();

    expect(res.status).toHaveBeenCalledWith(200);
    const json = sentJson(res);
    expect(json[game.tokenField]).toEqual(expect.any(String));
    expect(json).toMatchObject({
      reply: "Hello, detective.",
      audioFileUrl: "/api/audio?file=test.mp3",
      streak: 0,
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(`${prefix}_started`, { guest: true }, null);
  });

  it("mints a guest-bound token for a caller with no account", async () => {
    const json = sentJson(await start());
    expect(verifyGameState(json[game.tokenField], game.id)).toMatchObject({
      runId: expect.any(String),
      issuedForUserId: null,
      issuedForGuestId: "guest-hash",
      streak: 0,
      wrongGuessCount: 0,
      canContinue: false,
    });
  });

  it("binds the token to a signed-in user instead of a guest", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const json = sentJson(await start());
    expect(verifyGameState(json[game.tokenField], game.id)).toMatchObject({
      issuedForUserId: "user-1",
      issuedForGuestId: null,
    });
    expect(mockEnsureGuestId).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith(`${prefix}_started`, { guest: false }, "user-1");
  });

  it("draws every name from the curated game pool, never the full character list", async () => {
    await start();
    if (game.hidesSpeaker) {
      expect(mockPickRandomCharacterName).toHaveBeenCalledTimes(1);
      expect(mockPickRandomCharacterName).toHaveBeenCalledWith([], gameCharacterNames);
    } else {
      expect(mockPickRandomCharacterName).toHaveBeenNthCalledWith(1, [], gameCharacterNames);
      expect(mockPickRandomCharacterName).toHaveBeenNthCalledWith(
        2,
        ["Sherlock Holmes"],
        gameCharacterNames,
      );
    }
  });

  it("casts the speaker's voice from its full persona prompt, so each hidden target gets its own cache entry", async () => {
    await start();
    expect(mockGetVoiceConfigForCharacter).toHaveBeenCalledWith(
      speaker,
      "male",
      "persona prompt here",
    );
  });

  if (game.hidesSpeaker) {
    it("withholds the mystery's name and avatar from the response while keeping them in the token", async () => {
      const json = sentJson(await start());

      expect(JSON.stringify(json)).not.toContain("Irene Adler");
      expect(JSON.stringify(json)).not.toContain("avatar.png");
      expect(json.currentCharacterName).toBeUndefined();
      const state = verifyGameState(json[game.tokenField], game.id);
      expect(state).toMatchObject({
        speakerName: "Irene Adler",
        targetName: "Irene Adler",
        avatarUrl: "https://example.com/avatar.png",
        usedNames: ["Irene Adler"],
      });
    });

    it("greets with the self-clue opening instruction", async () => {
      await start();
      expect(mockGetOpeningReply).toHaveBeenCalledWith(
        "persona prompt here",
        "__SELF_CLUE_OPENING_INSTRUCTION__",
      );
    });
  } else {
    it("shows the named speaker but hides the target in the response while keeping it in the token", async () => {
      const json = sentJson(await start());

      expect(json).toMatchObject({
        currentCharacterName: "Sherlock Holmes",
        avatarUrl: "https://example.com/avatar.png",
        gender: "male",
      });
      expect(JSON.stringify(json)).not.toContain("Irene Adler");
      expect(verifyGameState(json[game.tokenField], game.id)).toMatchObject({
        speakerName: "Sherlock Holmes",
        targetName: "Irene Adler",
        usedNames: ["Sherlock Holmes"],
      });
    });
  }

  it.each([
    ["persona generation", () => personaMock.mockRejectedValue(new Error("Claude is down"))],
    ["avatar generation", () => mockGetOrGenerateAvatar.mockRejectedValue(new Error("boom"))],
  ])("returns 500 and logs when %s fails", async (_name, fail) => {
    fail();
    const res = await start();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to start a new run" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      `${prefix}_start_failed`,
      expect.any(String),
      expect.anything(),
    );
  });

  it("streams real progress frames as each step completes when stream: true", async () => {
    const res = await start({ stream: true });

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    const frames = sseFrames(res);
    expect(
      frames
        .filter((frame) => frame.done === false)
        .map((frame) => frame.stage)
        .sort(),
    ).toEqual(["avatar", "personality", "reply", "voice"]);
    const finalFrame = frames.find((frame) => frame.done === true);
    expect(finalFrame.reply).toBe("Hello, detective.");
    expect(finalFrame[game.tokenField]).toEqual(expect.any(String));
    expect(res.end).toHaveBeenCalled();
    // Streaming mode never also sends a plain JSON response.
    expect(res.status).not.toHaveBeenCalled();
  });

  it("streams an error frame instead of a 500 status when generation fails in stream mode", async () => {
    personaMock.mockRejectedValue(new Error("Claude is down"));
    const res = await start({ stream: true });

    const frames = sseFrames(res);
    expect(frames[frames.length - 1]).toEqual({ error: "Failed to start a new run", done: true });
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
