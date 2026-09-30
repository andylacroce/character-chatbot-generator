import { GAMES_UNDER_TEST, makeReq, makeRes, sentJson } from "../../../helpers/gameRoute";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockGetGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  getGuestId: (...args: unknown[]) => mockGetGuestId(...args),
}));

const mockGetHighScore = jest.fn();
const mockGetGuestHighScore = jest.fn();
jest.mock("../../../../src/utils/game/scores", () => ({
  getHighScore: (...args: unknown[]) => mockGetHighScore(...args),
  getGuestHighScore: (...args: unknown[]) => mockGetGuestHighScore(...args),
}));

const mockApplyRateLimit = jest.fn();
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => options,
  applyRateLimit: (...args: unknown[]) => mockApplyRateLimit(...args),
}));

jest.mock("../../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
  generateRequestId: () => "test-id",
}));

const handler = require("../../../../src/pages/api/[game]/high-score").default;

describe.each(GAMES_UNDER_TEST)("$slug/high-score API", (game) => {
  const OLD_ENV = process.env;
  const gameMatcher = expect.objectContaining({ id: game.id });

  async function read(method = "GET") {
    const res = makeRes();
    await handler(makeReq(game, undefined, method), res);
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
    mockApplyRateLimit.mockResolvedValue(true);
    mockGetSessionUserId.mockResolvedValue(null);
    mockGetGuestId.mockReturnValue(null);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("applies this game's own rate limiter", async () => {
    await read();
    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${game.slug}-high-score`, max: 20 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 405 for unsupported methods", async () => {
    expect((await read("POST")).status).toHaveBeenCalledWith(405);
  });

  it("returns a null high score for a caller with no session and no guest cookie", async () => {
    expect(sentJson(await read())).toEqual({ highScore: null });
    expect(mockGetHighScore).not.toHaveBeenCalled();
    expect(mockGetGuestHighScore).not.toHaveBeenCalled();
  });

  it("is a no-op when DATABASE_URL is not configured", async () => {
    delete process.env.DATABASE_URL;
    mockGetSessionUserId.mockResolvedValue("user-1");
    expect(sentJson(await read())).toEqual({ highScore: null });
    expect(mockGetHighScore).not.toHaveBeenCalled();
  });

  it("returns the signed-in user's stored personal best", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetHighScore.mockResolvedValue(7);
    expect(sentJson(await read())).toEqual({ highScore: 7 });
    expect(mockGetHighScore).toHaveBeenCalledWith(gameMatcher, "user-1");
  });

  it("returns null for a signed-in user who has never beaten a streak", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetHighScore.mockResolvedValue(null);
    expect(sentJson(await read())).toEqual({ highScore: null });
  });

  it("reads a guest's best from its browser cookie", async () => {
    mockGetGuestId.mockReturnValue("guest-hash");
    mockGetGuestHighScore.mockResolvedValue(4);
    expect(sentJson(await read())).toEqual({ highScore: 4 });
    expect(mockGetGuestHighScore).toHaveBeenCalledWith(gameMatcher, "guest-hash");
    expect(mockGetHighScore).not.toHaveBeenCalled();
  });

  it("degrades to null rather than failing when the guest lookup errors", async () => {
    mockGetGuestId.mockReturnValue("guest-hash");
    mockGetGuestHighScore.mockRejectedValue(new Error("db down"));
    const res = await read();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(sentJson(res)).toEqual({ highScore: null });
  });
});
