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

const mockUpdateHighScoreIfBeaten = jest.fn();
jest.mock("../../../../src/utils/guessWhoHighScore", () => ({
  updateHighScoreIfBeaten: (...args: unknown[]) => mockUpdateHighScoreIfBeaten(...(args as unknown[])),
}));

const mockRecordGuessWhoResult = jest.fn();
jest.mock("../../../../src/utils/guessWhoLeaderboard", () => ({
  recordGuessWhoResult: (...args: unknown[]) => mockRecordGuessWhoResult(...args),
}));

const mockGetGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  getGuestId: (...args: unknown[]) => mockGetGuestId(...args),
}));

const mockGetGameReply = jest.fn();
const mockGetGuessReactionReply = jest.fn();
jest.mock("../../../../src/utils/guessWhoNextReply", () => ({
  getGameReply: (...args: unknown[]) => mockGetGameReply(...(args as unknown[])),
  getGuessReactionReply: (...args: unknown[]) => mockGetGuessReactionReply(...(args as unknown[])),
  AMBIGUOUS_GUESS_NOTE: "maybe guessing",
}));

const mockClassifyGuess = jest.fn();
jest.mock("../../../../src/utils/classifyGuess", () => ({
  classifyGuess: (...args: unknown[]) => mockClassifyGuess(...(args as unknown[])),
}));

const mockSynthesizeReplyAudio = jest.fn();
jest.mock("../../../../src/utils/ttsReply", () => ({
  synthesizeReplyAudio: (...args: unknown[]) => mockSynthesizeReplyAudio(...(args as unknown[])),
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
    usedNames: ["Irene Adler"],
    streak: 2,
    wrongGuessCount: 0,
    environment: "test",
    issuedForUserId: null,
    issuedForGuestId: null,
    ...overrides,
  };
}

function mockClassification(status: "clear" | "ambiguous" | "none" | "giveUp", correct = false) {
  mockClassifyGuess.mockResolvedValueOnce({ status, correct });
}

describe("guess-who/message API", () => {
  let token: string;

  beforeEach(() => {
    jest.clearAllMocks();
    token = signGuessWhoState(makeState());
    mockSynthesizeReplyAudio.mockResolvedValue("/api/audio?file=test.mp3");
    mockGetSessionUserId.mockResolvedValue(null);
    mockUpdateHighScoreIfBeaten.mockResolvedValue(undefined);
    mockRecordGuessWhoResult.mockResolvedValue(undefined);
    mockGetGuestId.mockReturnValue(null);
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 when message is missing", async () => {
    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Message is required" });
  });

  it("returns 400 for an invalid or expired guessWhoToken", async () => {
    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: "not-a-real-token", message: "hello" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.error).toMatch(/expired|new game/i);
  });

  it("replies normally to an ordinary question, not a guess", async () => {
    mockClassification("none");
    mockGetGameReply.mockResolvedValueOnce("I've sung in many great halls, ask away.");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "What's your favorite city?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reply: "I've sung in many great halls, ask away.",
      audioFileUrl: "/api/audio?file=test.mp3",
    });
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "Irene Adler's self-clue persona prompt",
      [],
      "What's your favorite city?",
      1,
      undefined,
    );
    expect(mockClassifyGuess).toHaveBeenCalledWith("Irene Adler", "What's your favorite city?", []);
  });

  it("asks for confirmation on an ambiguous guess, without scoring it", async () => {
    mockClassification("ambiguous");
    mockGetGameReply.mockResolvedValueOnce("Do you have a name in mind?");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "is it someone from Bohemia?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reply: "Do you have a name in mind?",
      audioFileUrl: "/api/audio?file=test.mp3",
    });
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "Irene Adler's self-clue persona prompt",
      [],
      "is it someone from Bohemia?",
      1,
      "maybe guessing",
    );
  });

  it("signals giveUpRequested without generating a reply when the message is a give-up request", async () => {
    mockClassification("giveUp");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "I give up, just tell me" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ giveUpRequested: true });
    expect(mockGetGameReply).not.toHaveBeenCalled();
    expect(mockGetGuessReactionReply).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "guess_who_give_up_requested_via_chat",
      expect.any(String),
    );
  });

  it("judges a correct guess, reveals the identity, and returns a fresh continuable token", async () => {
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant, you got it!");
    mockSynthesizeReplyAudio.mockResolvedValueOnce("/api/audio?file=reaction.mp3");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "It's Irene Adler!" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(true);
    expect(json.gameOver).toBe(false);
    expect(json.revealedName).toBe("Irene Adler");
    expect(json.avatarUrl).toBe("https://example.com/irene.png");
    expect(json.gender).toBe("female");
    expect(json.streak).toBe(3);
    expect(json.reply).toBe("Brilliant, you got it!");
    expect(json.audioFileUrl).toBe("/api/audio?file=reaction.mp3");
    expect(typeof json.guessWhoToken).toBe("string");
    expect(verifyGuessWhoState(json.guessWhoToken)?.canContinue).toBe(true);
    expect(mockGetGuessReactionReply).toHaveBeenCalledWith(
      "Irene Adler's self-clue persona prompt",
      "correct",
      "Irene Adler",
    );
    expect(mockRecordEvent).toHaveBeenCalledWith("guess_who_guess_correct", { streak: 3 }, null);

    // The original token is untouched and still decodes the same hidden identity.
    const originalState = verifyGuessWhoState(token);
    expect(originalState?.hiddenName).toBe("Irene Adler");
  });

  it("never persists a personal best for a guest (no session) on a correct guess", async () => {
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant, you got it!");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "It's Irene Adler!" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateHighScoreIfBeaten).not.toHaveBeenCalled();
  });

  it("records a guest's score only when its browser cookie matches the issued token", async () => {
    token = signGuessWhoState(
      makeState({ runId: "run-1", issuedForGuestId: "guest-hash", environment: "development" }),
    );
    mockGetGuestId.mockReturnValue("guest-hash");
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant!");
    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const res = makeRes();
    await handler(makeReq({ guessWhoToken: token, message: "Irene Adler" }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRecordGuessWhoResult).toHaveBeenCalledWith(null, "guest-hash", "run-1", 3);
    expect(mockUpdateHighScoreIfBeaten).not.toHaveBeenCalled();
  });

  it("does not credit a guest score to a different browser", async () => {
    token = signGuessWhoState(
      makeState({ runId: "run-1", issuedForGuestId: "guest-hash", environment: "development" }),
    );
    mockGetGuestId.mockReturnValue("different-browser");
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant!");
    const handler = require("../../../../src/pages/api/guess-who/message").default;
    await handler(makeReq({ guessWhoToken: token, message: "Irene Adler" }), makeRes());
    expect(mockRecordGuessWhoResult).not.toHaveBeenCalled();
  });

  it("persists a personal best for a signed-in user on a correct guess", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    token = signGuessWhoState(
      makeState({ runId: "run-1", issuedForUserId: "user-1", environment: "development" }),
    );
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant, you got it!");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "It's Irene Adler!" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateHighScoreIfBeaten).toHaveBeenCalledWith("user-1", 3);
    expect(mockRecordGuessWhoResult).toHaveBeenCalledWith("user-1", null, "run-1", 3);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "guess_who_guess_correct",
      { streak: 3 },
      "user-1",
    );
  });

  it("tolerates a first wrong guess and reduces remaining tries", async () => {
    mockClassification("clear", false);
    mockGetGuessReactionReply.mockResolvedValueOnce("Not quite, try again?");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "Is it Cleopatra?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(false);
    expect(json.gameOver).toBe(false);
    expect(json.wrongGuessesRemaining).toBe(1);
    expect(json.reply).toBe("Not quite, try again?");
    expect(json.revealedName).toBeUndefined();
    expect(mockRecordEvent).toHaveBeenCalledWith("guess_who_guess_wrong", undefined, null);
    expect(mockRecordEvent).toHaveBeenCalledTimes(1);

    const state = verifyGuessWhoState(json.guessWhoToken);
    expect(state?.wrongGuessCount).toBe(1);
  });

  it("ends the run on a second wrong guess and reveals the hidden name and avatar", async () => {
    token = signGuessWhoState(makeState({ wrongGuessCount: 1 }));
    mockClassification("clear", false);
    mockGetGuessReactionReply.mockResolvedValueOnce("Alas, it was Irene Adler.");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "Is it Cleopatra?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(false);
    expect(json.gameOver).toBe(true);
    expect(json.revealedName).toBe("Irene Adler");
    expect(json.avatarUrl).toBe("https://example.com/irene.png");
    expect(json.gender).toBe("female");
    expect(json.finalStreak).toBe(2);
    expect(json.guessWhoToken).toBeUndefined();
    expect(mockRecordEvent).toHaveBeenCalledWith("guess_who_guess_wrong", undefined, null);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "guess_who_run_ended",
      { reason: "second_wrong", finalStreak: 2 },
      null,
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "guess_who_run_ended",
      expect.any(String),
      expect.anything(),
    );
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockClassification("none");
    mockGetGameReply.mockRejectedValueOnce(new Error("Claude is down"));

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "hello" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to generate a reply" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "guess_who_message_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("classifyGuess failure fails closed to 'none', handled as an ordinary question", async () => {
    mockClassifyGuess.mockResolvedValueOnce({ status: "none", correct: false });
    mockGetGameReply.mockResolvedValueOnce("Ask me something else.");

    const handler = require("../../../../src/pages/api/guess-who/message").default;
    const req = makeReq({ guessWhoToken: token, message: "garbled input" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "Irene Adler's self-clue persona prompt",
      [],
      "garbled input",
      1,
      undefined,
    );
  });
});
