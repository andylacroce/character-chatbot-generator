import type { NextApiRequest, NextApiResponse } from "next";
import { signGameState, verifyGameState } from "../../../../src/utils/gameToken";
import type { GameStatePayload } from "../../../../src/utils/gameToken";

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

// Mock JSON parser
jest.mock("../../../../src/utils/parseClaudeJson", () => ({
  extractJson: (text: string) => text.trim(),
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
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...(args as unknown[])),
}));

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

// Mock the personal-best persistence util
const mockUpdateHighScoreIfBeaten = jest.fn();
jest.mock("../../../../src/utils/gameHighScore", () => ({
  updateHighScoreIfBeaten: (...args: unknown[]) =>
    mockUpdateHighScoreIfBeaten(...(args as unknown[])),
}));

// Mock game reply functions
const mockGetGameReply = jest.fn();
const mockGetOpeningReply = jest.fn();
const mockGetGuessReactionReply = jest.fn();
jest.mock("../../../../src/utils/gameReply", () => ({
  getGameReply: (...args: unknown[]) => mockGetGameReply(...(args as unknown[])),
  getOpeningReply: (...args: unknown[]) => mockGetOpeningReply(...(args as unknown[])),
  getGuessReactionReply: (...args: unknown[]) => mockGetGuessReactionReply(...(args as unknown[])),
  AMBIGUOUS_GUESS_NOTE: "maybe guessing",
}));

// Mock TTS
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

function mockClassification(status: "clear" | "ambiguous" | "none" | "giveUp", correct = false) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify({ status, correct }) }],
  });
}

describe("game/message API", () => {
  let token: string;

  beforeEach(() => {
    jest.clearAllMocks();
    token = signGameState(makeGameState());
    mockSynthesizeReplyAudio.mockResolvedValue("/api/audio?file=test.mp3");
    mockGetSessionUserId.mockResolvedValue(null);
    mockUpdateHighScoreIfBeaten.mockResolvedValue(undefined);
  });

  it("returns 405 for non-POST methods", async () => {
    const handler = require("../../../../pages/api/game/message").default;
    const req = { method: "GET" } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 when message is missing", async () => {
    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Message is required" });
  });

  it("returns 400 for an invalid or expired game token", async () => {
    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: "not-a-real-token", message: "hello" });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.error).toMatch(/expired|new game/i);
  });

  it("replies normally to an ordinary question, not a guess", async () => {
    mockClassification("none");
    mockGetGameReply.mockResolvedValueOnce("I've solved many cases, ask away.");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "What's your favorite case?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reply: "I've solved many cases, ask away.",
      audioFileUrl: "/api/audio?file=test.mp3",
    });
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "persona prompt here",
      [],
      "What's your favorite case?",
      1,
      undefined,
    );
  });

  it("asks for confirmation on an ambiguous guess, without scoring it", async () => {
    mockClassification("ambiguous");
    mockGetGameReply.mockResolvedValueOnce("Do you have a name in mind?");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "is it someone from London?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reply: "Do you have a name in mind?",
      audioFileUrl: "/api/audio?file=test.mp3",
    });
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "persona prompt here",
      [],
      "is it someone from London?",
      1,
      "maybe guessing",
    );
  });

  it("signals giveUpRequested without generating a reply when the message is a give-up request", async () => {
    mockClassification("giveUp");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "I give up, just tell me" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ giveUpRequested: true });
    expect(mockGetGameReply).not.toHaveBeenCalled();
    expect(mockGetGuessReactionReply).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "game_give_up_requested_via_chat",
      expect.any(String),
    );
  });

  it("judges a correct guess quickly without generating the next round", async () => {
    // The next character is deliberately NOT generated here anymore (see this
    // handler's own doc comment) — that's deferred to POST /game/continue, called only
    // once the player clicks "Continue". This response should carry just the reaction
    // and outcome, and the existing token should remain untouched and still valid.
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant, you got it!");
    mockSynthesizeReplyAudio.mockResolvedValueOnce("/api/audio?file=reaction.mp3");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "It's Irene Adler!" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(true);
    expect(json.gameOver).toBe(false);
    expect(json.revealedName).toBe("Irene Adler");
    expect(json.streak).toBe(3);
    expect(mockRecordEvent).toHaveBeenCalledWith("game_guess_correct", { streak: 3 }, null);
    expect(json.reply).toBe("Brilliant, you got it!");
    expect(json.audioFileUrl).toBe("/api/audio?file=reaction.mp3");
    expect(json.nextReply).toBeUndefined();
    expect(json.currentCharacterName).toBeUndefined();
    expect(json.gameToken).toBeUndefined();

    // The original token is untouched, still decodes the same hidden target, and stays
    // usable for /game/continue.
    const state = verifyGameState(token);
    expect(state?.currentCharacterName).toBe("Sherlock Holmes");
    expect(state?.nextCharacterName).toBe("Irene Adler");
  });

  it("never persists a personal best for a guest (no session) on a correct guess", async () => {
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant, you got it!");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "It's Irene Adler!" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateHighScoreIfBeaten).not.toHaveBeenCalled();
  });

  it("persists a personal best for a signed-in user on a correct guess", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockClassification("clear", true);
    mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant, you got it!");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "It's Irene Adler!" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateHighScoreIfBeaten).toHaveBeenCalledWith("user-1", 3);
    expect(mockRecordEvent).toHaveBeenCalledWith("game_guess_correct", { streak: 3 }, "user-1");
  });

  it("tolerates a first wrong guess and reduces remaining tries", async () => {
    mockClassification("clear", false);
    mockGetGuessReactionReply.mockResolvedValueOnce("Not quite, try again?");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "Is it Moriarty?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(false);
    expect(json.gameOver).toBe(false);
    expect(json.wrongGuessesRemaining).toBe(1);
    expect(json.reply).toBe("Not quite, try again?");
    expect(mockRecordEvent).toHaveBeenCalledWith("game_guess_wrong", undefined, null);
    expect(mockRecordEvent).toHaveBeenCalledTimes(1);

    const state = verifyGameState(json.gameToken);
    expect(state?.wrongGuessCount).toBe(1);
  });

  it("ends the run on a second wrong guess and reveals the hidden name", async () => {
    token = signGameState(makeGameState({ wrongGuessCount: 1 }));
    mockClassification("clear", false);
    mockGetGuessReactionReply.mockResolvedValueOnce("Alas, it was Irene Adler.");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "Is it Moriarty?" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = (res.json as jest.Mock).mock.calls[0][0];
    expect(json.correct).toBe(false);
    expect(json.gameOver).toBe(true);
    expect(json.revealedName).toBe("Irene Adler");
    expect(json.finalStreak).toBe(2);
    expect(mockRecordEvent).toHaveBeenCalledWith("game_guess_wrong", undefined, null);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "game_run_ended",
      { reason: "second_wrong", finalStreak: 2 },
      null,
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "game_over",
      expect.any(String),
      expect.anything(),
    );
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockClassification("none");
    mockGetGameReply.mockRejectedValueOnce(new Error("Claude is down"));

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "hello" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to generate a reply" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_message_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("classifyGuess fails closed to 'none' on a malformed Claude response", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "not json" }] });
    mockGetGameReply.mockResolvedValueOnce("Ask me something else.");

    const handler = require("../../../../pages/api/game/message").default;
    const req = makeReq({ gameToken: token, message: "garbled input" });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "persona prompt here",
      [],
      "garbled input",
      1,
      undefined,
    );
  });
});
