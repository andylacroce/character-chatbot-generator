import { signGameState, verifyGameState } from "../../../../src/utils/game/token";
import gameCharacterNames from "../../../../src/data/gameCharacterNames";
import {
  GAMES_UNDER_TEST,
  makeReq,
  makeRes,
  makeState,
  sentJson,
  sseFrames,
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

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

const mockPickRandomCharacterName = jest.fn();
jest.mock("../../../../src/utils/pickRandomCharacterName", () => ({
  pickRandomCharacterName: (...args: unknown[]) => mockPickRandomCharacterName(...args),
}));

const mockSelfCluePersona = jest.fn();
const mockCluePersona = jest.fn();
jest.mock("../../../../src/config/serverConfig", () => ({
  generateGuessWhoSelfCluePersonaPrompt: (...args: unknown[]) => mockSelfCluePersona(...args),
  generateGameCluePersonaPrompt: (...args: unknown[]) => mockCluePersona(...args),
}));

const mockGetOrGenerateAvatar = jest.fn();
jest.mock("../../../../src/utils/avatarGeneration", () => ({
  getOrGenerateAvatar: (...args: unknown[]) => mockGetOrGenerateAvatar(...args),
}));

jest.mock("../../../../src/utils/gameReply", () => ({
  getOpeningReply: jest.fn().mockResolvedValue("Hello, dear player."),
  SELF_CLUE_OPENING_INSTRUCTION: "",
}));

jest.mock("../../../../src/utils/characterVoices", () => ({
  getVoiceConfigForCharacter: jest.fn().mockResolvedValue({ name: "voice" }),
}));

jest.mock("../../../../src/utils/ttsReply", () => ({
  synthesizeReplyAudio: jest.fn().mockResolvedValue("/api/audio?file=opening.mp3"),
}));

const handler = require("../../../../src/pages/api/[game]/continue").default;

describe.each(GAMES_UNDER_TEST)("$slug/continue API", (game) => {
  const prefix = game.eventPrefix;
  const personaMock = game.hidesSpeaker ? mockSelfCluePersona : mockCluePersona;
  // The state the correct guess left behind: streak 2, continuable.
  const before = makeState(game, {
    speakerName: game.hidesSpeaker ? "Zeus" : "Sherlock Holmes",
    targetName: game.hidesSpeaker ? "Zeus" : "Irene Adler",
    usedNames: game.hidesSpeaker ? ["Zeus"] : ["Sherlock Holmes"],
    canContinue: true,
  });
  let token: string;

  async function next(body: Record<string, unknown> = { [game.tokenField]: token }) {
    const res = makeRes();
    await handler(makeReq(game, body), res);
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    token = signGameState(before);
    mockApplyRateLimit.mockResolvedValue(true);
    mockGetSessionUserId.mockResolvedValue(null);
    // The next round picks its own fresh name: a new hidden target (Guess Who's Next) or a
    // new mystery (Guess Who).
    mockPickRandomCharacterName.mockReturnValue("Watson");
    personaMock.mockResolvedValue({ prompt: "next persona prompt" });
    mockGetOrGenerateAvatar.mockResolvedValue({
      avatarUrl: "https://example.com/next.png",
      gender: "female",
    });
  });

  it("applies this game's own rate limiter", async () => {
    await next();
    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${game.slug}-continue`, max: 10 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 405 for non-POST methods", async () => {
    const res = makeRes();
    await handler(makeReq(game, undefined, "GET"), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 for an invalid or expired token", async () => {
    const res = await next({ [game.tokenField]: "not-a-real-token" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      `${prefix}_continue_invalid_token`,
      expect.any(String),
    );
  });

  it("rejects a token minted for the other game", async () => {
    const other = GAMES_UNDER_TEST.find((candidate) => candidate.id !== game.id)!;
    const res = await next({
      [game.tokenField]: signGameState(makeState(other, { canContinue: true })),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPickRandomCharacterName).not.toHaveBeenCalled();
  });

  it("rejects a valid round token until a correct guess was judged", async () => {
    const res = await next({ [game.tokenField]: signGameState({ ...before, canContinue: false }) });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "A correct guess is required before continuing.",
    });
    expect(mockPickRandomCharacterName).not.toHaveBeenCalled();
  });

  it("generates the next round, raises the streak once, and carries the run's identity forward", async () => {
    const res = await next();

    expect(res.status).toHaveBeenCalledWith(200);
    const json = sentJson(res);
    // The streak from the ORIGINAL token (2) is incremented once here, since the correct
    // guess that led here never wrote the increment back into any token.
    expect(json).toMatchObject({
      reply: "Hello, dear player.",
      audioFileUrl: "/api/audio?file=opening.mp3",
      streak: 3,
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(`${prefix}_round_continued`, { streak: 3 }, null);

    const state = verifyGameState(json[game.tokenField], game.id);
    expect(state).toMatchObject({
      runId: "run-1",
      streak: 3,
      wrongGuessCount: 0,
      canContinue: false,
      environment: "test",
      issuedForUserId: null,
    });
  });

  if (game.hidesSpeaker) {
    it("starts a fresh mystery, excluding every name already met, and still withholds its identity", async () => {
      const json = sentJson(await next());

      expect(mockPickRandomCharacterName).toHaveBeenCalledWith(["Zeus"], gameCharacterNames);
      expect(verifyGameState(json[game.tokenField], game.id)).toMatchObject({
        speakerName: "Watson",
        targetName: "Watson",
        usedNames: ["Zeus", "Watson"],
      });
      expect(json.currentCharacterName).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain("Watson");
    });
  } else {
    it("promotes the revealed target to speaker and picks a fresh hidden one, excluding names already met", async () => {
      const json = sentJson(await next());

      expect(json).toMatchObject({
        currentCharacterName: "Irene Adler",
        avatarUrl: "https://example.com/next.png",
        gender: "female",
      });
      expect(mockPickRandomCharacterName).toHaveBeenCalledWith(
        ["Sherlock Holmes", "Irene Adler"],
        gameCharacterNames,
      );
      expect(verifyGameState(json[game.tokenField], game.id)).toMatchObject({
        speakerName: "Irene Adler",
        targetName: "Watson",
        usedNames: ["Sherlock Holmes", "Irene Adler"],
      });
      expect(JSON.stringify(json)).not.toContain("Watson");
    });
  }

  it("streams real progress frames as each step completes when stream: true", async () => {
    const res = await next({ [game.tokenField]: token, stream: true });

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    const frames = sseFrames(res);
    expect(
      frames
        .filter((frame) => frame.done === false)
        .map((frame) => frame.stage)
        .sort(),
    ).toEqual(["avatar", "personality", "reply", "voice"]);
    expect(frames.find((frame) => frame.done === true).streak).toBe(3);
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 500 and logs when round generation fails", async () => {
    personaMock.mockRejectedValue(new Error("Claude is down"));

    const res = await next();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to generate the next round" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      `${prefix}_continue_failed`,
      expect.any(String),
      expect.anything(),
    );
  });
});
