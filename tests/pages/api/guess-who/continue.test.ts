import type { NextApiRequest, NextApiResponse } from "next";
import { signGuessWhoState, verifyGuessWhoState } from "../../../../src/utils/guessWhoToken";
import type { GuessWhoStatePayload } from "../../../../src/utils/guessWhoToken";

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

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
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
    voiceConfig: { languageCodes: ["en-US"], name: "en-US-Wavenet-C", ssmlGender: 2 },
    usedNames: ["Irene Adler"],
    streak: 2,
    wrongGuessCount: 0,
    environment: "test",
    issuedForUserId: null,
    issuedForGuestId: null,
    canContinue: true,
    ...overrides,
  };
}

function nextRound() {
  return {
    hiddenName: "Ada Lovelace",
    personaPrompt: "Ada Lovelace's self-clue persona prompt",
    avatarUrl: "https://example.com/ada.png",
    gender: "female",
    voiceConfig: { languageCodes: ["en-GB"], name: "en-GB-Studio-C", ssmlGender: 2 },
    reply: "Good day, shall we chat?",
    audioFileUrl: "/api/audio?file=opening.mp3",
  };
}

describe("guess-who/continue API", () => {
  let token: string;

  beforeEach(() => {
    jest.clearAllMocks();
    token = signGuessWhoState(makeState());
    mockGetSessionUserId.mockResolvedValue(null);
    mockGenerateSelfClueRound.mockResolvedValue(nextRound());
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../src/pages/api/guess-who/continue").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 for an invalid or expired token", async () => {
    const handler = require("../../../../src/pages/api/guess-who/continue").default;
    const req = makeReq({ guessWhoToken: "not-a-real-token" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects continuing until a correct guess was judged (canContinue !== true)", async () => {
    const notReadyToken = signGuessWhoState(makeState({ canContinue: false }));
    const handler = require("../../../../src/pages/api/guess-who/continue").default;
    const req = makeReq({ guessWhoToken: notReadyToken });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "A correct guess is required before continuing.",
    });
    expect(mockGenerateSelfClueRound).not.toHaveBeenCalled();
  });

  it("generates the next round, increments the streak, and returns a fresh token", async () => {
    const handler = require("../../../../src/pages/api/guess-who/continue").default;
    const req = makeReq({ guessWhoToken: token });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.reply).toBe("Good day, shall we chat?");
    expect(json.audioFileUrl).toBe("/api/audio?file=opening.mp3");
    expect(json.streak).toBe(3);
    expect(typeof json.guessWhoToken).toBe("string");
    expect(JSON.stringify(json)).not.toContain("Ada Lovelace");

    const state = verifyGuessWhoState(json.guessWhoToken);
    expect(state?.hiddenName).toBe("Ada Lovelace");
    expect(state?.avatarUrl).toBe("https://example.com/ada.png");
    expect(state?.usedNames).toEqual(["Irene Adler", "Ada Lovelace"]);
    expect(state?.streak).toBe(3);
    expect(state?.wrongGuessCount).toBe(0);
    expect(state?.canContinue).toBe(false);

    expect(mockGenerateSelfClueRound).toHaveBeenCalledWith(["Irene Adler"], undefined);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "guess_who_round_continued",
      { streak: 3 },
      null,
    );
  });

  it("streams real progress frames as each round-generation step completes when stream: true", async () => {
    mockGenerateSelfClueRound.mockImplementation(
      async (_excludeNames: string[], onProgress?: (stage: string) => void) => {
        onProgress?.("personality");
        onProgress?.("avatar");
        onProgress?.("reply");
        onProgress?.("voice");
        return nextRound();
      },
    );

    const handler = require("../../../../src/pages/api/guess-who/continue").default;
    const req = makeReq({ guessWhoToken: token, stream: true });
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
    expect(finalFrame.reply).toBe("Good day, shall we chat?");
    expect(finalFrame.streak).toBe(3);
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 500 when round generation fails", async () => {
    mockGenerateSelfClueRound.mockRejectedValueOnce(new Error("Claude is down"));

    const handler = require("../../../../src/pages/api/guess-who/continue").default;
    const req = makeReq({ guessWhoToken: token });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to generate the next round" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "guess_who_continue_failed",
      expect.any(String),
      expect.anything(),
    );
  });
});
