import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockGetHighScore = jest.fn();
jest.mock("../../../../src/utils/guessWhoHighScore", () => ({
  getHighScore: (...args: unknown[]) => mockGetHighScore(...args),
}));

const mockGetGuestHighScore = jest.fn();
jest.mock("../../../../src/utils/guessWhoLeaderboard", () => ({
  getGuestHighScore: (...args: unknown[]) => mockGetGuestHighScore(...args),
}));

const mockGetGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  getGuestId: (...args: unknown[]) => mockGetGuestId(...args),
}));

jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: () => ({ limiterName: "test" }),
  applyRateLimit: () => Promise.resolve(true),
}));

describe("guess-who/high-score API", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
    mockGetGuestId.mockReturnValue(null);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 405 for unsupported methods", async () => {
    const handler = (await import("../../../../src/pages/api/guess-who/high-score")).default;
    const { req, res } = createMocks({ method: "POST" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns null for a guest with no cookie-bound identity", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const handler = (await import("../../../../src/pages/api/guess-who/high-score")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ highScore: null });
  });

  it("returns the signed-in user's stored personal best", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetHighScore.mockResolvedValue(4);
    const handler = (await import("../../../../src/pages/api/guess-who/high-score")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getJSONData()).toEqual({ highScore: 4 });
    expect(mockGetHighScore).toHaveBeenCalledWith("user-1");
  });

  it("returns a guest's best via the guest-scoped lookup", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockGetGuestId.mockReturnValue("guest-abc");
    mockGetGuestHighScore.mockResolvedValue(2);
    const handler = (await import("../../../../src/pages/api/guess-who/high-score")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getJSONData()).toEqual({ highScore: 2 });
    expect(mockGetGuestHighScore).toHaveBeenCalledWith("guest-abc");
  });
});
