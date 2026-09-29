import type { NextApiRequest, NextApiResponse } from "next";
import { signGuessWhoState, verifyGuessWhoState } from "../../../../src/utils/guessWhoToken";
import type { GuessWhoStatePayload } from "../../../../src/utils/guessWhoToken";

const mockCreate = jest.fn();
jest.mock("../../../../src/utils/anthropicClient", () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...(args as [unknown])) } },
}));

jest.mock("../../../../src/utils/claudeModelSelector", () => ({
  getClaudeModel: (_: string) => "claude-test",
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

const mockUpdateHighScoreIfBeaten = jest.fn();
jest.mock("../../../../src/utils/guessWhoHighScore", () => ({
  updateHighScoreIfBeaten: (...args: unknown[]) => mockUpdateHighScoreIfBeaten(...args),
}));

const mockRecordGuessWhoResult = jest.fn();
jest.mock("../../../../src/utils/guessWhoLeaderboard", () => ({
  recordGuessWhoResult: (...args: unknown[]) => mockRecordGuessWhoResult(...args),
}));

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
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
    usedNames: ["Sherlock Holmes"],
    streak: 2,
    environment: "test",
    issuedForUserId: null,
    issuedForGuestId: null,
    ...overrides,
  };
}

function mockClaudeResponse(correct: boolean) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify({ reasoning: "because", correct }) }],
  });
}

describe("guess-who/guess API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrGenerateAvatar.mockResolvedValue({
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
    });
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../src/pages/api/guess-who/guess").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 when guess is missing", async () => {
    const handler = require("../../../../src/pages/api/guess-who/guess").default;
    const req = makeReq({ guessWhoToken: "x" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for an invalid or expired token", async () => {
    const handler = require("../../../../src/pages/api/guess-who/guess").default;
    const req = makeReq({ guessWhoToken: "not-a-real-token", guess: "Irene Adler" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("on a correct guess, reveals the name, generates its avatar, and records the score", async () => {
    mockClaudeResponse(true);
    const token = signGuessWhoState(makeState({ issuedForUserId: "user-1" }));
    const handler = require("../../../../src/pages/api/guess-who/guess").default;
    const req = makeReq({ guessWhoToken: token, guess: "Irene Adler" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(true);
    expect(json.gameOver).toBe(false);
    expect(json.revealedName).toBe("Irene Adler");
    expect(json.avatarUrl).toBe("https://example.com/irene.png");
    expect(json.streak).toBe(3);
    expect(json.guessWhoToken).toBeUndefined();
    expect(mockUpdateHighScoreIfBeaten).toHaveBeenCalledWith("user-1", 3);
    expect(mockRecordGuessWhoResult).toHaveBeenCalledWith("user-1", null, "run-1", 3);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "guess_who_guess_correct",
      { streak: 3 },
      "user-1",
    );
  });

  it("on a wrong guess with clues remaining, reveals the next clue and issues a fresh token", async () => {
    mockClaudeResponse(false);
    const token = signGuessWhoState(makeState({ revealedCount: 2 }));
    const handler = require("../../../../src/pages/api/guess-who/guess").default;
    const req = makeReq({ guessWhoToken: token, guess: "Sherlock Holmes" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(false);
    expect(json.gameOver).toBe(false);
    expect(json.clue).toBe("3");
    expect(json.clueNumber).toBe(3);
    expect(json.totalClues).toBe(5);
    expect(json.guessWhoToken).toEqual(expect.any(String));
    const newState = verifyGuessWhoState(json.guessWhoToken);
    expect(newState?.revealedCount).toBe(3);
    expect(mockRecordEvent).toHaveBeenCalledWith("guess_who_guess_wrong", undefined, null);
  });

  it("ends the run and reveals the answer once all clues are exhausted on a wrong guess", async () => {
    mockClaudeResponse(false);
    const token = signGuessWhoState(makeState({ revealedCount: 5 }));
    const handler = require("../../../../src/pages/api/guess-who/guess").default;
    const req = makeReq({ guessWhoToken: token, guess: "Sherlock Holmes" });
    const res = makeRes();
    await handler(req, res);

    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(false);
    expect(json.gameOver).toBe(true);
    expect(json.revealedName).toBe("Irene Adler");
    expect(json.streak).toBe(0);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "guess_who_run_ended",
      { reason: "out_of_clues", finalStreak: 2 },
      null,
    );
  });

  it("fails closed to incorrect when the classifier errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Claude down"));
    const token = signGuessWhoState(makeState({ revealedCount: 1 }));
    const handler = require("../../../../src/pages/api/guess-who/guess").default;
    const req = makeReq({ guessWhoToken: token, guess: "Irene Adler" });
    const res = makeRes();
    await handler(req, res);

    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(false);
  });
});
