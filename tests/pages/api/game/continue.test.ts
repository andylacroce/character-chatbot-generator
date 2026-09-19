import type { NextApiRequest, NextApiResponse } from "next";
import { signGameState, verifyGameState } from "../../../../src/utils/gameToken";
import type { GameStatePayload } from "../../../../src/utils/gameToken";

// Mock logger
const mockLogEvent = jest.fn();
jest.mock("../../../../src/utils/logger", () => ({
  __esModule: true,
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (m: unknown) => m,
  generateRequestId: () => "test-id",
}));

// Mock rate limiter to always pass
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: () => ({ limiterName: "test" }),
  applyRateLimit: () => Promise.resolve(true),
}));

// Mock session user
const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...(args as [unknown])),
}));

// Mock game utilities generateGameRound uses internally
jest.mock("../../../../src/utils/pickRandomCharacterName", () => ({
  pickRandomCharacterName: jest.fn(),
}));

jest.mock("../../../../src/config/serverConfig", () => ({
  generateGameCluePersonaPrompt: jest.fn(),
  generatePersonalityPrompt: jest.fn(),
}));

jest.mock("../../../../src/utils/avatarGeneration", () => ({
  getOrGenerateAvatar: jest.fn(),
}));

jest.mock("../../../../src/utils/gameReply", () => ({
  getOpeningReply: jest.fn(),
}));

jest.mock("../../../../src/utils/characterVoices", () => ({
  getVoiceConfigForCharacter: jest.fn(),
}));

jest.mock("../../../../src/utils/ttsReply", () => ({
  synthesizeReplyAudio: jest.fn(),
}));

process.env.API_SECRET = "test-api-secret";

function makeRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  res.end = jest.fn().mockReturnValue(res as NextApiResponse);
  res.setHeader = jest.fn();
  res.write = jest.fn();
  return res as NextApiResponse;
}

function makeReq(body: Record<string, unknown>): NextApiRequest {
  return { method: "POST", body } as Partial<NextApiRequest> as NextApiRequest;
}

function makeGameState(overrides: Partial<GameStatePayload> = {}): GameStatePayload {
  return {
    currentCharacterName: "Sherlock Holmes",
    nextCharacterName: "Irene Adler",
    personaPrompt: "persona prompt here",
    avatarUrl: "https://example.com/sherlock.png",
    gender: "male",
    voiceConfig: { languageCodes: ["en-GB"], name: "en-GB-Wavenad-D", ssmlGender: 1 },
    usedNames: ["Sherlock Holmes"],
    streak: 2,
    wrongGuessCount: 0,
    environment: "test",
    issuedForUserId: null,
    ...overrides,
  };
}

describe("game/continue API", () => {
  let token: string;

  beforeEach(() => {
    jest.clearAllMocks();
    token = signGameState(makeGameState());
    mockGetSessionUserId.mockResolvedValue(null);

    const { pickRandomCharacterName } = require("../../../../src/utils/pickRandomCharacterName");
    const { generateGameCluePersonaPrompt } = require("../../../../src/config/serverConfig");
    const avatarGeneration = require("../../../../src/utils/avatarGeneration");
    const { getOpeningReply } = require("../../../../src/utils/gameReply");
    const { getVoiceConfigForCharacter } = require("../../../../src/utils/characterVoices");
    const { synthesizeReplyAudio } = require("../../../../src/utils/ttsReply");

    // generateGameRound(revealedName="Irene Adler", ...) picks ITS OWN fresh hidden target.
    pickRandomCharacterName.mockReturnValueOnce("Watson");
    generateGameCluePersonaPrompt.mockResolvedValueOnce({ prompt: "Irene's persona prompt" });
    avatarGeneration.getOrGenerateAvatar.mockResolvedValueOnce({
      avatarUrl: "https://example.com/adler.png",
      gender: "female",
    });
    getOpeningReply.mockResolvedValueOnce("Hello, dear player.");
    getVoiceConfigForCharacter.mockResolvedValueOnce({
      languageCodes: ["en-US"],
      name: "en-US-Wavenet-C",
      ssmlGender: 2,
    });
    synthesizeReplyAudio.mockResolvedValueOnce("/api/audio?file=opening.mp3");
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../pages/api/game/continue").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 for an invalid or expired game token", async () => {
    const handler = require("../../../../pages/api/game/continue").default;
    const req = makeReq({ gameToken: "not-a-real-token" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("generates the newly-revealed character's round from the still-hidden nextCharacterName", async () => {
    const handler = require("../../../../pages/api/game/continue").default;
    const req = makeReq({ gameToken: token });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.currentCharacterName).toBe("Irene Adler");
    expect(json.avatarUrl).toBe("https://example.com/adler.png");
    expect(json.gender).toBe("female");
    expect(json.reply).toBe("Hello, dear player.");
    expect(json.audioFileUrl).toBe("/api/audio?file=opening.mp3");
    // The streak from the ORIGINAL token (2) is incremented once here, since the
    // correct guess that led here never wrote the increment back into any token —
    // see pages/api/game/message.ts's doc comment.
    expect(json.streak).toBe(3);

    const state = verifyGameState(json.gameToken);
    expect(state?.currentCharacterName).toBe("Irene Adler");
    expect(state?.nextCharacterName).toBe("Watson");
    expect(state?.usedNames).toEqual(["Sherlock Holmes", "Irene Adler"]);
    expect(state?.streak).toBe(3);
    expect(state?.wrongGuessCount).toBe(0);

    const { pickRandomCharacterName } = require("../../../../src/utils/pickRandomCharacterName");
    const gameCharacterNames = require("../../../../src/data/gameCharacterNames").default;
    expect(pickRandomCharacterName).toHaveBeenCalledWith(
      ["Sherlock Holmes", "Irene Adler"],
      gameCharacterNames,
    );
  });

  it("streams real progress frames as each round-generation step completes when stream: true", async () => {
    const handler = require("../../../../pages/api/game/continue").default;
    const req = makeReq({ gameToken: token, stream: true });
    const res = makeRes();
    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    const writes = (res.write as jest.Mock).mock.calls.map((call) => JSON.parse(call[0].slice(6)));
    const progressFrames = writes.filter((frame) => frame.done === false);
    expect(progressFrames.map((frame) => frame.stage).sort()).toEqual([
      "avatar",
      "personality",
      "reply",
      "voice",
    ]);

    const finalFrame = writes.find((frame) => frame.done === true);
    expect(finalFrame.currentCharacterName).toBe("Irene Adler");
    expect(finalFrame.streak).toBe(3);
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 500 when round generation fails", async () => {
    const { generateGameCluePersonaPrompt } = require("../../../../src/config/serverConfig");
    generateGameCluePersonaPrompt.mockReset();
    generateGameCluePersonaPrompt.mockRejectedValueOnce(new Error("Claude is down"));

    const handler = require("../../../../pages/api/game/continue").default;
    const req = makeReq({ gameToken: token });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to generate the next round" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_continue_failed",
      expect.any(String),
      expect.anything(),
    );
  });
});
