import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockGetHighScore = jest.fn();
jest.mock("../../../../src/utils/gameHighScore", () => ({
  getHighScore: (...args: unknown[]) => mockGetHighScore(...args),
}));

jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: () => ({ limiterName: "test" }),
  applyRateLimit: () => Promise.resolve(true),
}));

describe("game/high-score API", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 405 for unsupported methods", async () => {
    const handler = (await import("../../../../src/pages/api/game/high-score")).default;
    const { req, res } = createMocks({ method: "POST" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns a null high score for a guest (no session)", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const handler = (await import("../../../../src/pages/api/game/high-score")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ highScore: null });
    expect(mockGetHighScore).not.toHaveBeenCalled();
  });

  it("is a no-op when signed in but DATABASE_URL is not configured", async () => {
    delete process.env.DATABASE_URL;
    mockGetSessionUserId.mockResolvedValue("user-1");
    const handler = (await import("../../../../src/pages/api/game/high-score")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ highScore: null });
    expect(mockGetHighScore).not.toHaveBeenCalled();
  });

  it("returns the signed-in user's stored personal best", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetHighScore.mockResolvedValue(7);
    const handler = (await import("../../../../src/pages/api/game/high-score")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ highScore: 7 });
    expect(mockGetHighScore).toHaveBeenCalledWith("user-1");
  });

  it("returns null for a signed-in user who has never beaten a streak", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetHighScore.mockResolvedValue(null);
    const handler = (await import("../../../../src/pages/api/game/high-score")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getJSONData()).toEqual({ highScore: null });
  });
});
