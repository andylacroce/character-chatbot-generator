import { GUESS_WHO } from "character-chatbot-shared";
import { signGameState, verifyGameState } from "../../../../src/utils/game/token";
import {
  GAMES_UNDER_TEST,
  makeReq,
  makeRes,
  makeState,
  sentJson,
} from "../../../helpers/gameRoute";

const mockLogEvent = jest.fn();
jest.mock("../../../../src/utils/logger", () => ({
  __esModule: true,
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
  generateRequestId: () => "test-id",
}));

const mockApplyRateLimit = jest.fn();
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => options,
  applyRateLimit: (...args: unknown[]) => mockApplyRateLimit(...args),
}));

jest.mock("../../../../src/utils/environment", () => ({ getCurrentEnvironment: () => "test" }));

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

const mockUpdateHighScoreIfBeaten = jest.fn();
const mockRecordGameResult = jest.fn();
jest.mock("../../../../src/utils/game/scores", () => ({
  updateHighScoreIfBeaten: (...args: unknown[]) => mockUpdateHighScoreIfBeaten(...args),
  recordGameResult: (...args: unknown[]) => mockRecordGameResult(...args),
}));

const mockGetGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  getGuestId: (...args: unknown[]) => mockGetGuestId(...args),
}));

const mockGetGameReply = jest.fn();
const mockGetGuessReactionReply = jest.fn();
jest.mock("../../../../src/utils/gameReply", () => ({
  getGameReply: (...args: unknown[]) => mockGetGameReply(...args),
  getGuessReactionReply: (...args: unknown[]) => mockGetGuessReactionReply(...args),
  AMBIGUOUS_GUESS_NOTE: "maybe guessing",
}));

const mockClassifyGuess = jest.fn();
jest.mock("../../../../src/utils/classifyGuess", () => ({
  classifyGuess: (...args: unknown[]) => mockClassifyGuess(...args),
}));

const mockSynthesizeReplyAudio = jest.fn();
jest.mock("../../../../src/utils/ttsReply", () => ({
  synthesizeReplyAudio: (...args: unknown[]) => mockSynthesizeReplyAudio(...args),
}));

const handler = require("../../../../src/pages/api/[game]/message").default;

describe.each(GAMES_UNDER_TEST)("$slug/message API", (game) => {
  const prefix = game.eventPrefix;
  let token: string;

  /** Sends one message and returns the response double. */
  async function send(body: Record<string, unknown>, overrides?: { token?: string }) {
    const res = makeRes();
    await handler(makeReq(game, { [game.tokenField]: overrides?.token ?? token, ...body }), res);
    return res;
  }

  function classify(status: "clear" | "ambiguous" | "none" | "giveUp", correct = false) {
    mockClassifyGuess.mockResolvedValueOnce({ status, correct });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    token = signGameState(makeState(game));
    mockApplyRateLimit.mockResolvedValue(true);
    mockSynthesizeReplyAudio.mockResolvedValue("/api/audio?file=test.mp3");
    mockGetSessionUserId.mockResolvedValue(null);
    mockGetGuestId.mockReturnValue(null);
    mockUpdateHighScoreIfBeaten.mockResolvedValue(undefined);
    mockRecordGameResult.mockResolvedValue(undefined);
  });

  it("applies this game's own rate limiter", async () => {
    classify("none");
    mockGetGameReply.mockResolvedValueOnce("ok");
    await send({ message: "hi" });
    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${game.slug}-message`, max: 10 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 405 for non-POST methods", async () => {
    const res = makeRes();
    await handler(makeReq(game, undefined, "GET"), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 when message is missing", async () => {
    const res = await send({});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Message is required" });
  });

  it("returns 400 for an invalid or expired token", async () => {
    const res = await send({ message: "hello" }, { token: "not-a-real-token" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sentJson(res).error).toMatch(/expired|new game/i);
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      `${prefix}_invalid_token`,
      expect.any(String),
    );
  });

  it("rejects a token minted for the other game", async () => {
    const other = GAMES_UNDER_TEST.find((candidate) => candidate.id !== game.id)!;
    const res = await send({ message: "hello" }, { token: signGameState(makeState(other)) });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockClassifyGuess).not.toHaveBeenCalled();
  });

  it("replies in the speaker's voice to an ordinary question, classifying against the hidden target", async () => {
    const state = makeState(game);
    classify("none");
    mockGetGameReply.mockResolvedValueOnce("Ask away.");

    const res = await send({ message: "What's your favorite case?" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reply: "Ask away.",
      audioFileUrl: "/api/audio?file=test.mp3",
    });
    expect(mockClassifyGuess).toHaveBeenCalledWith(
      state.targetName,
      "What's your favorite case?",
      [],
    );
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "persona prompt here",
      [],
      "What's your favorite case?",
      1,
      undefined,
    );
    expect(mockSynthesizeReplyAudio).toHaveBeenCalledWith(
      "Ask away.",
      state.speakerName,
      state.gender,
      state.voiceConfig,
    );
  });

  it("asks for confirmation on an ambiguous guess, without scoring it", async () => {
    classify("ambiguous");
    mockGetGameReply.mockResolvedValueOnce("Do you have a name in mind?");

    const res = await send({ message: "is it someone from London?" });

    expect(sentJson(res).reply).toBe("Do you have a name in mind?");
    expect(mockGetGameReply).toHaveBeenCalledWith(
      "persona prompt here",
      [],
      "is it someone from London?",
      1,
      "maybe guessing",
    );
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it("signals giveUpRequested without generating a reply", async () => {
    classify("giveUp");

    const res = await send({ message: "I give up, just tell me" });

    expect(res.json).toHaveBeenCalledWith({ giveUpRequested: true });
    expect(mockGetGameReply).not.toHaveBeenCalled();
    expect(mockGetGuessReactionReply).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      `${prefix}_give_up_requested_via_chat`,
      expect.any(String),
    );
  });

  describe("a correct guess", () => {
    it("judges quickly without generating the next round, and re-signs a continuable token", async () => {
      const state = makeState(game);
      classify("clear", true);
      mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant, you got it!");
      mockSynthesizeReplyAudio.mockResolvedValueOnce("/api/audio?file=reaction.mp3");

      const res = await send({ message: "It's Irene Adler!" });

      expect(res.status).toHaveBeenCalledWith(200);
      const json = sentJson(res);
      expect(json).toMatchObject({
        reply: "Brilliant, you got it!",
        audioFileUrl: "/api/audio?file=reaction.mp3",
        correct: true,
        gameOver: false,
        revealedName: "Irene Adler",
        streak: 3,
      });
      expect(json.nextReply).toBeUndefined();
      expect(mockGetGuessReactionReply).toHaveBeenCalledWith(
        "persona prompt here",
        "correct",
        "Irene Adler",
      );
      expect(mockRecordEvent).toHaveBeenCalledWith(`${prefix}_guess_correct`, { streak: 3 }, null);

      // The token travels under the game's own wire name and proves the guess was judged.
      expect(verifyGameState(json[game.tokenField], game.id)?.canContinue).toBe(true);
      // The original token is untouched: still the same hidden target, still usable.
      expect(verifyGameState(token, game.id)).toMatchObject({
        speakerName: state.speakerName,
        targetName: "Irene Adler",
      });
    });

    it("releases the hidden speaker's avatar and gender only in Guess Who", async () => {
      classify("clear", true);
      mockGetGuessReactionReply.mockResolvedValueOnce("Yes!");

      const json = sentJson(await send({ message: "Irene Adler" }));

      if (game.hidesSpeaker) {
        expect(json.avatarUrl).toBe("https://example.com/avatar.png");
        expect(json.gender).toBe("female");
      } else {
        expect(json.avatarUrl).toBeUndefined();
        expect(json.currentCharacterName).toBeUndefined();
      }
    });

    it("never persists a personal best for a caller with no identity", async () => {
      classify("clear", true);
      mockGetGuessReactionReply.mockResolvedValueOnce("Yes!");
      await send({ message: "Irene Adler" });
      expect(mockUpdateHighScoreIfBeaten).not.toHaveBeenCalled();
      expect(mockRecordGameResult).not.toHaveBeenCalled();
    });

    it("records a guest's score only when its browser cookie matches the issued token", async () => {
      token = signGameState(makeState(game, { issuedForGuestId: "guest-hash" }));
      mockGetGuestId.mockReturnValue("guest-hash");
      classify("clear", true);
      mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant!");

      await send({ message: "Irene Adler" });

      expect(mockRecordGameResult).toHaveBeenCalledWith(
        expect.objectContaining({ id: game.id }),
        null,
        "guest-hash",
        "run-1",
        3,
      );
      expect(mockUpdateHighScoreIfBeaten).not.toHaveBeenCalled();
    });

    it("does not credit a guest score to a different browser", async () => {
      token = signGameState(makeState(game, { issuedForGuestId: "guest-hash" }));
      mockGetGuestId.mockReturnValue("different-browser");
      classify("clear", true);
      mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant!");

      await send({ message: "Irene Adler" });

      expect(mockRecordGameResult).not.toHaveBeenCalled();
    });

    it("persists a personal best for the signed-in user the token was issued to", async () => {
      mockGetSessionUserId.mockResolvedValue("user-1");
      token = signGameState(makeState(game, { issuedForUserId: "user-1" }));
      classify("clear", true);
      mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant!");

      await send({ message: "Irene Adler" });

      expect(mockUpdateHighScoreIfBeaten).toHaveBeenCalledWith(
        expect.objectContaining({ id: game.id }),
        "user-1",
        3,
      );
      expect(mockRecordGameResult).toHaveBeenCalledWith(
        expect.objectContaining({ id: game.id }),
        "user-1",
        null,
        "run-1",
        3,
      );
      expect(mockRecordEvent).toHaveBeenCalledWith(
        `${prefix}_guess_correct`,
        { streak: 3 },
        "user-1",
      );
    });

    it("does not credit a signed-in user with a token issued to someone else", async () => {
      mockGetSessionUserId.mockResolvedValue("user-2");
      token = signGameState(makeState(game, { issuedForUserId: "user-1" }));
      classify("clear", true);
      mockGetGuessReactionReply.mockResolvedValueOnce("Brilliant!");

      await send({ message: "Irene Adler" });

      expect(mockUpdateHighScoreIfBeaten).not.toHaveBeenCalled();
    });
  });

  describe("a wrong guess", () => {
    it("tolerates the first one and bumps the wrong-guess count in a fresh token", async () => {
      classify("clear", false);
      mockGetGuessReactionReply.mockResolvedValueOnce("Not quite, try again?");

      const json = sentJson(await send({ message: "Is it Moriarty?" }));

      expect(json).toMatchObject({
        reply: "Not quite, try again?",
        correct: false,
        gameOver: false,
        wrongGuessesRemaining: 1,
      });
      expect(mockGetGuessReactionReply).toHaveBeenCalledWith(
        "persona prompt here",
        "wrong",
        "Irene Adler",
      );
      expect(mockRecordEvent).toHaveBeenCalledTimes(1);
      expect(mockRecordEvent).toHaveBeenCalledWith(`${prefix}_guess_wrong`, undefined, null);
      expect(verifyGameState(json[game.tokenField], game.id)?.wrongGuessCount).toBe(1);
    });

    it("ends the run on the second one and reveals the hidden name", async () => {
      token = signGameState(makeState(game, { wrongGuessCount: 1 }));
      classify("clear", false);
      mockGetGuessReactionReply.mockResolvedValueOnce("Alas, it was Irene Adler.");

      const json = sentJson(await send({ message: "Is it Moriarty?" }));

      expect(json).toMatchObject({
        correct: false,
        gameOver: true,
        revealedName: "Irene Adler",
        finalStreak: 2,
      });
      expect(json[game.tokenField]).toBeUndefined();
      expect(mockGetGuessReactionReply).toHaveBeenCalledWith(
        "persona prompt here",
        "finalWrong",
        "Irene Adler",
      );
      expect(mockRecordEvent).toHaveBeenCalledWith(`${prefix}_guess_wrong`, undefined, null);
      expect(mockRecordEvent).toHaveBeenCalledWith(
        `${prefix}_run_ended`,
        { reason: "second_wrong", finalStreak: 2 },
        null,
      );
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        `${prefix}_run_ended`,
        expect.any(String),
        expect.anything(),
      );
      expect(json.avatarUrl !== undefined).toBe(game === GUESS_WHO);
    });
  });

  it("returns 500 and logs when an unexpected error occurs", async () => {
    classify("none");
    mockGetGameReply.mockRejectedValueOnce(new Error("Claude is down"));

    const res = await send({ message: "hello" });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to generate a reply" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      `${prefix}_message_failed`,
      expect.any(String),
      expect.anything(),
    );
  });
});
