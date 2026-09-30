import { signGameState } from "../../../../src/utils/game/token";
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

const mockRecordEvent = jest.fn();
jest.mock("../../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

const handler = require("../../../../src/pages/api/[game]/give-up").default;

describe.each(GAMES_UNDER_TEST)("$slug/give-up API", (game) => {
  const prefix = game.eventPrefix;

  async function giveUp(body: Record<string, unknown> | undefined, method = "POST") {
    const res = makeRes();
    await handler(makeReq(game, body, method), res);
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyRateLimit.mockResolvedValue(true);
  });

  it("applies this game's own rate limiter", async () => {
    await giveUp({});
    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${game.slug}-give-up`, max: 10 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 405 for non-POST methods", async () => {
    expect((await giveUp(undefined, "GET")).status).toHaveBeenCalledWith(405);
  });

  it("returns 400 for a missing, invalid or expired token", async () => {
    for (const body of [undefined, { [game.tokenField]: "not-a-real-token" }]) {
      const res = await giveUp(body);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(sentJson(res).error).toMatch(/expired|new game/i);
    }
  });

  it("rejects a token minted for the other game", async () => {
    const other = GAMES_UNDER_TEST.find((candidate) => candidate.id !== game.id)!;
    const res = await giveUp({ [game.tokenField]: signGameState(makeState(other)) });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("reveals the hidden name straight from the token, with no Claude call", async () => {
    const res = await giveUp({ [game.tokenField]: signGameState(makeState(game)) });

    expect(res.status).toHaveBeenCalledWith(200);
    const json = sentJson(res);
    expect(json).toMatchObject({ revealedName: "Irene Adler", finalStreak: 2, gameOver: true });
    // Only a hidden-speaker game has an already-generated avatar to release with the name.
    if (game.hidesSpeaker) {
      expect(json).toMatchObject({ avatarUrl: "https://example.com/avatar.png", gender: "female" });
    } else {
      expect(json.avatarUrl).toBeUndefined();
    }
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      `${prefix}_gave_up`,
      expect.any(String),
      expect.anything(),
    );
  });

  it.each<[string | null, string]>([
    [null, "a guest"],
    ["user-1", "a signed-in user"],
  ])("credits the run-end event to the token's owner (%s: %s)", async (userId) => {
    await giveUp({
      [game.tokenField]: signGameState(makeState(game, { issuedForUserId: userId })),
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(
      `${prefix}_run_ended`,
      { reason: "give_up", finalStreak: 2 },
      userId,
    );
  });
});
