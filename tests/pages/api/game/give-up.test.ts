import type { NextApiRequest, NextApiResponse } from "next";
import { signGameState } from "../../../../src/utils/gameToken";
import type { GameStatePayload } from "../../../../src/utils/gameToken";

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

const mockLogEvent = jest.fn();
jest.mock("../../../../src/utils/logger", () => ({
  __esModule: true,
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (m: unknown) => m,
  generateRequestId: () => "test-id",
}));

jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: () => ({ limiterName: "test" }),
  applyRateLimit: () => Promise.resolve(true),
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
    streak: 3,
    wrongGuessCount: 0,
    environment: "test",
    issuedForUserId: null,
    ...overrides,
  };
}

describe("game/give-up API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../src/pages/api/game/give-up").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 for an invalid or expired game token", async () => {
    const handler = require("../../../../src/pages/api/game/give-up").default;
    const req = makeReq({ gameToken: "not-a-real-token" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.error).toMatch(/expired|new game/i);
  });

  it("reveals the hidden name and ends the run without touching Claude or audio", async () => {
    const token = signGameState(makeGameState());
    const handler = require("../../../../src/pages/api/game/give-up").default;
    const req = makeReq({ gameToken: token });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      revealedName: "Irene Adler",
      finalStreak: 3,
      gameOver: true,
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "game_run_ended",
      { reason: "give_up", finalStreak: 3 },
      null,
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "game_gave_up",
      expect.any(String),
      expect.anything(),
    );
  });
});
