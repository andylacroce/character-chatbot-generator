import { GAMES_UNDER_TEST, makeReq, makeRes, sentJson } from "../../../helpers/gameRoute";

const mockGetLeaderboard = jest.fn();
jest.mock("../../../../src/utils/game/scores", () => ({
  getLeaderboard: (...args: unknown[]) => mockGetLeaderboard(...args),
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

const handler = require("../../../../src/pages/api/[game]/leaderboard").default;

describe.each(GAMES_UNDER_TEST)("$slug/leaderboard API", (game) => {
  const OLD_ENV = process.env;

  async function read(method = "GET") {
    const res = makeRes();
    await handler(makeReq(game, undefined, method), res);
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
    mockApplyRateLimit.mockResolvedValue(true);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("applies this game's own rate limiter", async () => {
    mockGetLeaderboard.mockResolvedValue([]);
    await read();
    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${game.slug}-leaderboard`, max: 30 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 405 for unsupported methods", async () => {
    expect((await read("POST")).status).toHaveBeenCalledWith(405);
  });

  it("returns an empty list without DATABASE_URL configured", async () => {
    delete process.env.DATABASE_URL;
    expect(sentJson(await read())).toEqual({ entries: [] });
    expect(mockGetLeaderboard).not.toHaveBeenCalled();
  });

  it("returns this game's top-ten public entries", async () => {
    mockGetLeaderboard.mockResolvedValue([{ rank: 1, name: "Ada", streak: 9 }]);
    expect(sentJson(await read())).toEqual({ entries: [{ rank: 1, name: "Ada", streak: 9 }] });
    expect(mockGetLeaderboard).toHaveBeenCalledWith(expect.objectContaining({ id: game.id }));
  });

  it("returns 500 when the leaderboard query fails", async () => {
    mockGetLeaderboard.mockRejectedValue(new Error("db down"));
    expect((await read()).status).toHaveBeenCalledWith(500);
  });
});
