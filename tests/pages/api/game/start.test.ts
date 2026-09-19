import type { NextApiRequest, NextApiResponse } from "next";

// Mock Anthropic SDK
const mockCreate = jest.fn();
jest.mock("../../../../src/utils/anthropicClient", () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...(args as [unknown])) } },
}));

// Mock model selector
jest.mock("../../../../src/utils/claudeModelSelector", () => ({
  getClaudeModel: (_: string) => "claude-test",
}));

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

// Mock environment
jest.mock("../../../../src/utils/environment", () => ({
  getCurrentEnvironment: () => "test",
}));

// Mock game utilities
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
  return res as NextApiResponse;
}

describe("game/start API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionUserId.mockResolvedValue(null);

    const { pickRandomCharacterName } = require("../../../../src/utils/pickRandomCharacterName");
    const { generateGameCluePersonaPrompt } = require("../../../../src/config/serverConfig");
    const avatarGeneration = require("../../../../src/utils/avatarGeneration");
    const { getOpeningReply } = require("../../../../src/utils/gameReply");
    const { getVoiceConfigForCharacter } = require("../../../../src/utils/characterVoices");
    const { synthesizeReplyAudio } = require("../../../../src/utils/ttsReply");

    pickRandomCharacterName
      .mockReturnValueOnce("Sherlock Holmes")
      .mockReturnValueOnce("Irene Adler");
    generateGameCluePersonaPrompt.mockResolvedValueOnce({ prompt: "persona prompt here" });
    avatarGeneration.getOrGenerateAvatar.mockResolvedValueOnce({
      avatarUrl: "https://example.com/avatar.png",
      gender: "male",
    });
    getOpeningReply.mockResolvedValueOnce("Hello, detective.");
    getVoiceConfigForCharacter.mockResolvedValueOnce({
      languageCodes: ["en-GB"],
      name: "en-GB-Wavenad-D",
      ssmlGender: "MALE",
    });
    synthesizeReplyAudio.mockResolvedValueOnce("/api/audio?file=test.mp3");
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../pages/api/game/start").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 200 with game state on successful start", async () => {
    const handler = require("../../../../pages/api/game/start").default;
    const req = { method: "POST" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.gameToken).toEqual(expect.any(String));
    expect(json.currentCharacterName).toBe("Sherlock Holmes");
    expect(json.avatarUrl).toBe("https://example.com/avatar.png");
    expect(json.gender).toBe("male");
    expect(json.reply).toBe("Hello, detective.");
    expect(json.audioFileUrl).toBe("/api/audio?file=test.mp3");
    expect(json.streak).toBe(0);
  });

  it("calls pickRandomCharacterName twice with exclusion, drawing from the game's curated pool", async () => {
    const handler = require("../../../../pages/api/game/start").default;
    const req = { method: "POST" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    const { pickRandomCharacterName } = require("../../../../src/utils/pickRandomCharacterName");
    const gameCharacterNames = require("../../../../src/data/gameCharacterNames").default;
    expect(pickRandomCharacterName).toHaveBeenCalledTimes(2);
    expect(pickRandomCharacterName).toHaveBeenNthCalledWith(1, [], gameCharacterNames);
    expect(pickRandomCharacterName).toHaveBeenNthCalledWith(
      2,
      ["Sherlock Holmes"],
      gameCharacterNames,
    );
  });

  it("hides the next character name in the response but keeps it in the token", async () => {
    const handler = require("../../../../pages/api/game/start").default;
    const req = { method: "POST" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(mockGetSessionUserId).toHaveBeenCalled();
    const json = (res.json as jest.Mock).mock.calls[0][0];
    const { verifyGameState } = require("../../../../src/utils/gameToken");
    const state = verifyGameState(json.gameToken);
    expect(state).not.toBeNull();
    expect(state?.issuedForUserId).toBeNull();
    expect(state?.nextCharacterName).toBe("Irene Adler");
    expect(json.currentCharacterName).toBe("Sherlock Holmes");
    expect(JSON.stringify(json)).not.toContain("Irene Adler");
  });

  it("returns 500 when persona generation fails", async () => {
    const { generateGameCluePersonaPrompt } = require("../../../../src/config/serverConfig");
    generateGameCluePersonaPrompt.mockReset();
    generateGameCluePersonaPrompt.mockRejectedValueOnce(new Error("Claude is down"));

    const handler = require("../../../../pages/api/game/start").default;
    const req = { method: "POST" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to start a new run" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_start_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("returns 500 when avatar generation fails", async () => {
    const avatarGeneration = require("../../../../src/utils/avatarGeneration");
    avatarGeneration.getOrGenerateAvatar.mockReset();
    avatarGeneration.getOrGenerateAvatar.mockRejectedValueOnce(new Error("avatar boom"));

    const handler = require("../../../../pages/api/game/start").default;
    const req = { method: "POST" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
