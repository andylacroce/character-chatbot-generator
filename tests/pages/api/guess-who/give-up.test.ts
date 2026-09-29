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

const mockGetOrGenerateAvatar = jest.fn();
jest.mock("../../../../src/utils/avatarGeneration", () => ({
  getOrGenerateAvatar: (...args: unknown[]) => mockGetOrGenerateAvatar(...args),
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
    clues: ["1", "2", "3", "4", "5"],
    revealedCount: 2,
    usedNames: [],
    streak: 3,
    environment: "test",
    issuedForUserId: null,
    issuedForGuestId: null,
    ...overrides,
  };
}

describe("guess-who/give-up API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrGenerateAvatar.mockResolvedValue({
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
    });
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
  });

  it("reveals the hidden name with its avatar and ends the run", async () => {
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
  });

  it("returns 500 when avatar generation fails", async () => {
    mockGetOrGenerateAvatar.mockRejectedValueOnce(new Error("boom"));
    const token = signGuessWhoState(makeState());
    const handler = require("../../../../src/pages/api/guess-who/give-up").default;
    const req = makeReq({ guessWhoToken: token });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
