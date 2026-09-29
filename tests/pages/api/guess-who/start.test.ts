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

const mockGenerateSelfClueRound = jest.fn();
jest.mock("../../../../src/utils/guessWhoRound", () => ({
  generateSelfClueRound: (...args: unknown[]) => mockGenerateSelfClueRound(...args),
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

function baseRound() {
  return {
    hiddenName: "Irene Adler",
    personaPrompt: "Irene Adler's self-clue persona prompt",
    avatarUrl: "https://example.com/irene.png",
    gender: "female",
    voiceConfig: { languageCodes: ["en-US"], name: "en-US-Wavenet-C", ssmlGender: 2 },
    reply: "Hello, curious one.",
    audioFileUrl: "/api/audio?file=test.mp3",
  };
}

describe("guess-who/start API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionUserId.mockResolvedValue(null);
    mockEnsureGuestId.mockReturnValue("guest-1");
    mockGenerateSelfClueRound.mockResolvedValue(baseRound());
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 200 with the reply, audio, token, and streak on a fresh start", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.guessWhoToken).toEqual(expect.any(String));
    expect(json.reply).toBe("Hello, curious one.");
    expect(json.audioFileUrl).toBe("/api/audio?file=test.mp3");
    expect(json.streak).toBe(0);
    expect(mockGenerateSelfClueRound).toHaveBeenCalledWith([], undefined);
    expect(mockRecordEvent).toHaveBeenCalledWith("guess_who_started", { guest: true }, null);
  });

  it("hides the hidden name and avatar from the response but keeps them in the token", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    const { verifyGuessWhoState } = require("../../../../src/utils/guessWhoToken");
    const state = verifyGuessWhoState(json.guessWhoToken);
    expect(state).not.toBeNull();
    expect(state?.hiddenName).toBe("Irene Adler");
    expect(state?.avatarUrl).toBe("https://example.com/irene.png");
    expect(state?.usedNames).toEqual(["Irene Adler"]);
    expect(state?.canContinue).toBe(false);
    expect(JSON.stringify(json)).not.toContain("Irene Adler");
    expect(JSON.stringify(json)).not.toContain("https://example.com/irene.png");
  });

  it("issues the token scoped to the signed-in user, when signed in", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    const { verifyGuessWhoState } = require("../../../../src/utils/guessWhoToken");
    const state = verifyGuessWhoState(json.guessWhoToken);
    expect(state?.issuedForUserId).toBe("user-1");
    expect(state?.issuedForGuestId).toBeNull();
    expect(mockEnsureGuestId).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith("guess_who_started", { guest: false }, "user-1");
  });

  it("issues the token scoped to the guest identity, when not signed in", async () => {
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    const { verifyGuessWhoState } = require("../../../../src/utils/guessWhoToken");
    const state = verifyGuessWhoState(json.guessWhoToken);
    expect(state?.issuedForGuestId).toBe("guest-1");
    expect(state?.issuedForUserId).toBeNull();
  });

  it("returns 500 when round generation fails", async () => {
    mockGenerateSelfClueRound.mockRejectedValueOnce(new Error("Claude is down"));
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = { method: "POST", body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to start a new round" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "guess_who_start_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("streams real progress frames as each round-generation step completes when stream: true", async () => {
    mockGenerateSelfClueRound.mockImplementation(
      async (_excludeNames: string[], onProgress?: (stage: string) => void) => {
        onProgress?.("personality");
        onProgress?.("avatar");
        onProgress?.("reply");
        onProgress?.("voice");
        return baseRound();
      },
    );

    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = {
      method: "POST",
      body: { stream: true },
    } as Partial<NextApiRequest> as NextApiRequest;
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
    expect(finalFrame.reply).toBe("Hello, curious one.");
    expect(finalFrame.guessWhoToken).toEqual(expect.any(String));
    expect(finalFrame.streak).toBe(0);
    expect(JSON.stringify(finalFrame)).not.toContain("Irene Adler");
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("streams an error frame instead of a 500 status when generation fails in stream mode", async () => {
    mockGenerateSelfClueRound.mockRejectedValueOnce(new Error("Claude is down"));
    const handler = require("../../../../src/pages/api/guess-who/start").default;
    const req = {
      method: "POST",
      body: { stream: true },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);

    const writes = (res.write as jest.Mock).mock.calls.map((call) => JSON.parse(call[0].slice(6)));
    expect(writes[writes.length - 1]).toEqual({ error: "Failed to start a new round", done: true });
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
