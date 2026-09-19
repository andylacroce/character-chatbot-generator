import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));
const mockGetGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  getGuestId: (...args: unknown[]) => mockGetGuestId(...args),
}));
const mockIsTopTenPlayer = jest.fn();
const mockGetClaimableRun = jest.fn();
jest.mock("../../../../src/utils/gameLeaderboard", () => ({
  isTopTenPlayer: (...args: unknown[]) => mockIsTopTenPlayer(...args),
  getClaimableRun: (...args: unknown[]) => mockGetClaimableRun(...args),
}));
const mockCheckLeaderboardName = jest.fn();
jest.mock("../../../../src/utils/leaderboardName", () => ({
  checkLeaderboardName: (...args: unknown[]) => mockCheckLeaderboardName(...args),
}));
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: () => ({ limiterName: "test" }),
  applyRateLimit: () => Promise.resolve(true),
}));
jest.mock("../../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (value: unknown) => value,
  generateRequestId: () => "test-id",
}));

const mockReturning = jest.fn();
const mockOnConflictDoUpdate = jest.fn(() => ({ returning: mockReturning }));
const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = jest.fn(() => ({ values: mockValues }));
const mockWhere = jest.fn();
const mockFrom = jest.fn(() => ({ where: mockWhere }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));
const mockUpdateWhere = jest.fn(() => ({ returning: mockReturning }));
const mockSet = jest.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));
jest.mock("../../../../src/db/client", () => ({
  getDb: () => ({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
}));

describe("game/leaderboard-settings API", () => {
  const oldEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...oldEnv, DATABASE_URL: "postgres://test" };
    mockGetSessionUserId.mockResolvedValue(null);
    mockGetGuestId.mockReturnValue("guest-hash");
    mockIsTopTenPlayer.mockResolvedValue(true);
    mockGetClaimableRun.mockResolvedValue(null);
    mockCheckLeaderboardName.mockResolvedValue({ status: "approved", name: "Guest Ace" });
    mockReturning.mockResolvedValue([{ showOnLeaderboard: true, name: "Guest Ace" }]);
    mockWhere.mockResolvedValue([]);
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it("lets an eligible guest browser submit a moderated name", async () => {
    const handler = (await import("../../../../pages/api/game/leaderboard-settings")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { showOnLeaderboard: true, name: "Guest Ace" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockIsTopTenPlayer).toHaveBeenCalledWith({ guestId: "guest-hash" });
    expect(mockCheckLeaderboardName).toHaveBeenCalledWith("Guest Ace");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        guestId: "guest-hash",
        leaderboardName: "Guest Ace",
        showOnLeaderboard: true,
      }),
    );
  });

  it("rejects a player outside the top ten before moderation or database writes", async () => {
    mockIsTopTenPlayer.mockResolvedValue(false);
    const handler = (await import("../../../../pages/api/game/leaderboard-settings")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { showOnLeaderboard: true, name: "Guest Ace" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(mockCheckLeaderboardName).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not publish an abusive or unverified name", async () => {
    const handler = (await import("../../../../pages/api/game/leaderboard-settings")).default;
    for (const [status, expected] of [
      ["rejected", 400],
      ["unavailable", 503],
    ] as const) {
      mockCheckLeaderboardName.mockResolvedValueOnce({ status });
      const { req, res } = createMocks({
        method: "POST",
        body: { showOnLeaderboard: true, name: "Bad Name" },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(expected);
    }
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("allows a guest to leave without a moderation call", async () => {
    mockReturning.mockResolvedValueOnce([{ showOnLeaderboard: false, name: "Guest Ace" }]);
    const handler = (await import("../../../../pages/api/game/leaderboard-settings")).default;
    const { req, res } = createMocks({ method: "POST", body: { showOnLeaderboard: false } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockCheckLeaderboardName).not.toHaveBeenCalled();
    expect(res._getJSONData().showOnLeaderboard).toBe(false);
  });

  it("requires a browser identity for a guest", async () => {
    mockGetGuestId.mockReturnValue(null);
    const handler = (await import("../../../../pages/api/game/leaderboard-settings")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { showOnLeaderboard: true, name: "Ace" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("locks an approved name to its run across later score increases", async () => {
    mockGetClaimableRun.mockResolvedValue({
      id: "run-1",
      bestStreak: 4,
      leaderboardName: "Guest Ace",
    });
    const handler = (await import("../../../../pages/api/game/leaderboard-settings")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { showOnLeaderboard: true, name: "Different Name", runId: "run-1" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(mockCheckLeaderboardName).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("lets an account claim its run without relying on the guest cookie", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockGetClaimableRun.mockResolvedValue({ id: "run-1", bestStreak: 4, leaderboardName: null });
    mockCheckLeaderboardName.mockResolvedValue({ status: "approved", name: "Ada" });
    mockReturning
      .mockResolvedValueOnce([{ id: "run-1" }])
      .mockResolvedValueOnce([{ showOnLeaderboard: true, name: "Ada" }]);
    const handler = (await import("../../../../pages/api/game/leaderboard-settings")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { showOnLeaderboard: true, name: "Ada", runId: "run-1" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockGetGuestId).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(res._getJSONData()).toEqual(
      expect.objectContaining({
        name: "Ada",
        runId: "run-1",
        locked: true,
      }),
    );
  });
});
