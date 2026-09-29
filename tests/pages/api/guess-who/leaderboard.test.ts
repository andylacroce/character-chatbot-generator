import { createMocks } from "node-mocks-http";

const mockGetLeaderboard = jest.fn();
jest.mock("../../../../src/utils/guessWhoLeaderboard", () => ({
  getLeaderboard: (...args: unknown[]) => mockGetLeaderboard(...args),
}));

jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: () => ({ limiterName: "test" }),
  applyRateLimit: () => Promise.resolve(true),
}));

describe("guess-who/leaderboard API", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 405 for unsupported methods", async () => {
    const handler = (await import("../../../../src/pages/api/guess-who/leaderboard")).default;
    const { req, res } = createMocks({ method: "POST" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns an empty list without DATABASE_URL configured", async () => {
    delete process.env.DATABASE_URL;
    const handler = (await import("../../../../src/pages/api/guess-who/leaderboard")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ entries: [] });
    expect(mockGetLeaderboard).not.toHaveBeenCalled();
  });

  it("returns the top-ten public entries", async () => {
    mockGetLeaderboard.mockResolvedValue([{ rank: 1, name: "Ada", streak: 9 }]);
    const handler = (await import("../../../../src/pages/api/guess-who/leaderboard")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ entries: [{ rank: 1, name: "Ada", streak: 9 }] });
  });

  it("returns 500 when the leaderboard query fails", async () => {
    mockGetLeaderboard.mockRejectedValue(new Error("db down"));
    const handler = (await import("../../../../src/pages/api/guess-who/leaderboard")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});
