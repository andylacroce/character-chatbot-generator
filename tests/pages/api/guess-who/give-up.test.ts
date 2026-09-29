import type { NextApiRequest, NextApiResponse } from "next";
import { signGuessWhoState } from "../../../../src/utils/guessWhoToken";
import type { GuessWhoStatePayload } from "../../../../src/utils/guessWhoToken";

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

function makeState(overrides: Partial<GuessWhoStatePayload> = {}): GuessWhoStatePayload {
  return {
    runId: "run-1",
    hiddenName: "Irene Adler",
    personaPrompt: "Irene Adler's self-clue persona prompt",
    avatarUrl: "https://example.com/irene.png",
    gender: "female",
    voiceConfig: { languageCodes: ["en-US"], name: "en-US-Wavenet-C", ssmlGender: "FEMALE" },
    usedNames: [],
    streak: 3,
    wrongGuessCount: 0,
    environment: "test",
    issuedForUserId: null,
    issuedForGuestId: null,
    ...overrides,
  };
}

describe("guess-who/give-up API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../src/pages/api/guess-who/give-up").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 for an invalid or expired token", async () => {
    const handler = require("../../../../src/pages/api/guess-who/give-up").default;
    const req = makeReq({ guessWhoToken: "not-a-real-token" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.error).toMatch(/expired|new game/i);
  });

  it("reveals the hidden name and its already-generated avatar directly from the token, with no avatar generation call", async () => {
    const token = signGuessWhoState(makeState());
    const handler = require("../../../../src/pages/api/guess-who/give-up").default;
    const req = makeReq({ guessWhoToken: token });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      finalStreak: 3,
      gameOver: true,
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "guess_who_run_ended",
      { reason: "give_up", finalStreak: 3 },
      null,
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "guess_who_gave_up",
      expect.any(String),
      expect.anything(),
    );
  });

  it("credits the run-end event to the token's issuedForUserId", async () => {
    const token = signGuessWhoState(makeState({ issuedForUserId: "user-1" }));
    const handler = require("../../../../src/pages/api/guess-who/give-up").default;
    const req = makeReq({ guessWhoToken: token });
    const res = makeRes();
    await handler(req, res);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "guess_who_run_ended",
      { reason: "give_up", finalStreak: 3 },
      "user-1",
    );
  });
});
