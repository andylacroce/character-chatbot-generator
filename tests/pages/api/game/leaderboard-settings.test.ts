import { GAMES_UNDER_TEST, makeReq, makeRes, sentJson } from "../../../helpers/gameRoute";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));
const mockGetGuestId = jest.fn();
jest.mock("../../../../src/utils/gameGuestIdentity", () => ({
  getGuestId: (...args: unknown[]) => mockGetGuestId(...args),
}));
const mockIsTopTenPlayer = jest.fn();
jest.mock("../../../../src/utils/game/scores", () => ({
  isTopTenPlayer: (...args: unknown[]) => mockIsTopTenPlayer(...args),
}));
const mockCheckLeaderboardName = jest.fn();
jest.mock("../../../../src/utils/leaderboardName", () => ({
  checkLeaderboardName: (...args: unknown[]) => mockCheckLeaderboardName(...args),
}));
const mockApplyRateLimit = jest.fn();
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => options,
  applyRateLimit: (...args: unknown[]) => mockApplyRateLimit(...args),
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

const handler = require("../../../../src/pages/api/[game]/leaderboard-settings").default;

describe.each(GAMES_UNDER_TEST)("$slug/leaderboard-settings API", (game) => {
  const oldEnv = process.env;
  // Each game keeps its own guest opt-in table; a signed-in user's opt-in is shared.
  const guestTable = require("../../../../src/utils/game/definitions").getServerGame(game.slug)
    .tables.guestProfiles;

  async function call(method: string, body?: Record<string, unknown>) {
    const res = makeRes();
    await handler(makeReq(game, body, method), res);
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...oldEnv, DATABASE_URL: "postgres://test" };
    mockApplyRateLimit.mockResolvedValue(true);
    mockGetSessionUserId.mockResolvedValue(null);
    mockGetGuestId.mockReturnValue("guest-hash");
    mockIsTopTenPlayer.mockResolvedValue(true);
    mockCheckLeaderboardName.mockResolvedValue({ status: "approved", name: "Guest Ace" });
    mockReturning.mockResolvedValue([{ showOnLeaderboard: true, name: "Guest Ace" }]);
    mockWhere.mockResolvedValue([]);
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it("applies this game's own rate limiter", async () => {
    await call("GET");
    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${game.slug}-leaderboard-settings`, max: 5 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 405 for unsupported methods", async () => {
    expect((await call("DELETE")).status).toHaveBeenCalledWith(405);
  });

  it("reads this game's guest profile for a guest on GET", async () => {
    mockWhere.mockResolvedValue([{ showOnLeaderboard: true, name: "Guest Ace" }]);
    const res = await call("GET");
    expect(sentJson(res)).toEqual({
      available: true,
      showOnLeaderboard: true,
      eligible: true,
      name: "Guest Ace",
    });
    expect(mockFrom).toHaveBeenCalledWith(guestTable);
  });

  it("reports the setting unavailable, not an error, to a caller with no identity on GET", async () => {
    mockGetGuestId.mockReturnValue(null);
    expect(sentJson(await call("GET"))).toEqual({
      available: false,
      showOnLeaderboard: false,
      eligible: false,
      name: null,
    });
  });

  it("lets an eligible guest browser submit a moderated name into this game's guest table", async () => {
    const res = await call("POST", { showOnLeaderboard: true, name: "Guest Ace" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockIsTopTenPlayer).toHaveBeenCalledWith(expect.objectContaining({ id: game.id }), {
      guestId: "guest-hash",
    });
    expect(mockCheckLeaderboardName).toHaveBeenCalledWith("Guest Ace");
    expect(mockInsert).toHaveBeenCalledWith(guestTable);
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
    const res = await call("POST", { showOnLeaderboard: true, name: "Guest Ace" });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCheckLeaderboardName).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it.each([
    ["rejected", 400],
    ["unavailable", 503],
  ])("does not publish a name the moderator marks %s", async (status, expected) => {
    mockCheckLeaderboardName.mockResolvedValueOnce({ status });
    const res = await call("POST", { showOnLeaderboard: true, name: "Bad Name" });
    expect(res.status).toHaveBeenCalledWith(expected);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("allows a guest to leave without a moderation call", async () => {
    mockReturning.mockResolvedValueOnce([{ showOnLeaderboard: false, name: "Guest Ace" }]);
    const res = await call("POST", { showOnLeaderboard: false });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckLeaderboardName).not.toHaveBeenCalled();
    expect(sentJson(res).showOnLeaderboard).toBe(false);
  });

  it("rejects a malformed setting", async () => {
    expect((await call("POST", { showOnLeaderboard: "yes" })).status).toHaveBeenCalledWith(400);
  });

  it("requires a browser identity for a guest", async () => {
    mockGetGuestId.mockReturnValue(null);
    const res = await call("POST", { showOnLeaderboard: true, name: "Ace" });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("lets a signed-in account submit a moderated name without relying on the guest cookie", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockCheckLeaderboardName.mockResolvedValue({ status: "approved", name: "Ada" });
    mockReturning.mockResolvedValueOnce([{ showOnLeaderboard: true, name: "Ada" }]);

    const res = await call("POST", { showOnLeaderboard: true, name: "Ada" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetGuestId).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(sentJson(res)).toEqual(expect.objectContaining({ name: "Ada" }));
  });
});
