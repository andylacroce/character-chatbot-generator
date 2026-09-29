import type { NextApiRequest, NextApiResponse } from "next";

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

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...(args as [unknown])),
}));

const mockEnsureGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  ensureGuestId: (...args: unknown[]) => mockEnsureGuestId(...args),
}));

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

jest.mock("../../../../src/utils/environment", () => ({
  getCurrentEnvironment: () => "test",
}));

const mockGenerateGuessWhoRound = jest.fn();
jest.mock("../../../../src/utils/guessWhoRound", () => ({
  generateGuessWhoRound: (...args: unknown[]) => mockGenerateGuessWhoRound(...args),
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

describe("guess-who/start API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionUserId.mockResolvedValue(null);
    mockEnsureGuestId.mockReturnValue("guest-1");
    mockGenerateGuessWhoRound.mockResolvedValue({
      hiddenName: "Irene Adler",
      clues: ["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"],
    });
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns the first clue and a token on a fresh start", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.guessWhoToken).toEqual(expect.any(String));
    expect(json.clue).toBe("Clue 1");
    expect(json.clueNumber).toBe(1);
    expect(json.totalClues).toBe(5);
    expect(json.streak).toBe(0);
    expect(mockRecordEvent).toHaveBeenCalledWith("guess_who_started", { guest: true }, null);
  });

  it("never records a new-run start event when continuing with usedNames", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = {
      method: "POST",
      body: { usedNames: ["Irene Adler"], streak: 1 },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(mockRecordEvent).not.toHaveBeenCalled();
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.streak).toBe(1);
    expect(mockGenerateGuessWhoRound).toHaveBeenCalledWith(["Irene Adler"]);
  });

  it("hides the hidden name from the response but keeps it in the token", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    const { verifyGuessWhoState } = require("../../../../src/utils/guessWhoToken");
    const state = verifyGuessWhoState(json.guessWhoToken);
    expect(state).not.toBeNull();
    expect(state?.hiddenName).toBe("Irene Adler");
    expect(JSON.stringify(json)).not.toContain("Irene Adler");
  });

  it("returns 500 when round generation fails", async () => {
    mockGenerateGuessWhoRound.mockRejectedValueOnce(new Error("Claude is down"));
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "guess_who_start_failed",
      expect.any(String),
      expect.anything(),
    );
  });
});
