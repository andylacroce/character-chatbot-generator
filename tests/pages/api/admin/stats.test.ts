import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockIsAdmin = jest.fn();
jest.mock("../../../../src/utils/isAdmin", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

jest.mock("../../../../src/utils/environment", () => ({
  getCurrentEnvironment: () => "test-env",
}));

/** A minimal chainable stand-in for a Drizzle query builder: every chain method
 * returns itself, and awaiting (or `.then`-ing) it resolves to the canned rows —
 * good enough for exercising the route's response assembly without re-testing
 * Drizzle itself. */
function makeQuery(rows: unknown[]) {
  const query = {
    from: () => query,
    where: () => query,
    groupBy: () => query,
    orderBy: () => query,
    innerJoin: () => query,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

// The handler issues these 7 `db.select(...)` calls in this exact order (see
// pages/api/admin/stats.ts): daily activity, character_validated aggregate,
// character_validated-by-warningLevel, bot_created aggregate, avatar_generated
// by provider, bots total, messages total.
const DAILY_ROWS = [{ day: "2026-09-10", validated: 4, created: 2, avatarGenerated: 2 }];
const VALIDATION_AGG_ROW = [{ total: 10, blocked: 1, unrecognized: 3 }];
const VALIDATION_BY_LEVEL_ROWS = [
  { warningLevel: "none", total: 8 },
  { warningLevel: "caution", total: 2 },
];
const CREATOR_AGG_ROW = [{ total: 6, guest: 4, signedIn: 2 }];
const AVATAR_PROVIDER_ROWS = [
  { provider: "cache", total: 3 },
  { provider: "cloudflare", total: 2 },
  { provider: "none", total: 1 },
];
const BOTS_TOTAL_ROW = [{ total: 2 }];
const MESSAGES_TOTAL_ROW = [{ total: 10 }];

function queueDefaultSelects(mockSelect: jest.Mock) {
  mockSelect
    .mockImplementationOnce(() => makeQuery(DAILY_ROWS))
    .mockImplementationOnce(() => makeQuery(VALIDATION_AGG_ROW))
    .mockImplementationOnce(() => makeQuery(VALIDATION_BY_LEVEL_ROWS))
    .mockImplementationOnce(() => makeQuery(CREATOR_AGG_ROW))
    .mockImplementationOnce(() => makeQuery(AVATAR_PROVIDER_ROWS))
    .mockImplementationOnce(() => makeQuery(BOTS_TOTAL_ROW))
    .mockImplementationOnce(() => makeQuery(MESSAGES_TOTAL_ROW));
}

const mockSelect = jest.fn();
const mockDb = { select: mockSelect };
jest.mock("../../../../src/db/client", () => ({ getDb: () => mockDb }));

jest.mock("express-rate-limit", () => {
  return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

describe("admin/stats API", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 405 for non-GET methods", async () => {
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "POST" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 401 for a guest (no session)", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in user who isn't an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockIsAdmin.mockResolvedValue(false);
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns a no-op empty shape without DATABASE_URL, even for an admin", async () => {
    process.env.DATABASE_URL = "";
    mockGetSessionUserId.mockResolvedValue("admin-1");
    mockIsAdmin.mockResolvedValue(true);
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.environment).toBe("test-env");
    expect(data.totals).toEqual({ bots: 0, messages: 0, avgMessagesPerBot: 0 });
    expect(data.activity).toEqual({ createdToday: 0, createdLast7Days: 0, daily: [] });
    expect(data.funnel).toEqual({ validated: 0, blocked: 0, created: 0, creationRatePct: null });
    expect(data.creators).toEqual({ guestCount: 0, signedInCount: 0, guestPct: null });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns aggregate, derived stats for an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("admin-1");
    mockIsAdmin.mockResolvedValue(true);
    queueDefaultSelects(mockSelect);
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();

    expect(data.environment).toBe("test-env");
    expect(data.totals).toEqual({ bots: 2, messages: 10, avgMessagesPerBot: 5 });
    expect(data.activity.daily).toEqual(DAILY_ROWS);
    // validated=10, created=6 -> 60.0%
    expect(data.funnel).toEqual({ validated: 10, blocked: 1, created: 6, creationRatePct: 60 });
    expect(data.validation.byWarningLevel).toEqual(VALIDATION_BY_LEVEL_ROWS);
    // unrecognized=3 of validated=10 -> 30%
    expect(data.validation.unrecognizedCount).toBe(3);
    expect(data.validation.unrecognizedPct).toBe(30);
    // guest=4 of created=6 -> 66.7%
    expect(data.creators).toEqual({ guestCount: 4, signedInCount: 2, guestPct: 66.7 });
    // avatar total=6, none=1 -> 16.7%
    expect(data.avatars.fallbackRatePct).toBe(16.7);
    expect(data.avatars.byProvider).toEqual([
      { provider: "cache", total: 3, pct: 50 },
      { provider: "cloudflare", total: 2, pct: 33.3 },
      { provider: "none", total: 1, pct: 16.7 },
    ]);
  });

  it("returns null rates (not NaN/Infinity) when a denominator is 0", async () => {
    mockGetSessionUserId.mockResolvedValue("admin-1");
    mockIsAdmin.mockResolvedValue(true);
    mockSelect
      .mockImplementationOnce(() => makeQuery([]))
      .mockImplementationOnce(() => makeQuery([{ total: 0, blocked: 0, unrecognized: 0 }]))
      .mockImplementationOnce(() => makeQuery([]))
      .mockImplementationOnce(() => makeQuery([{ total: 0, guest: 0, signedIn: 0 }]))
      .mockImplementationOnce(() => makeQuery([]))
      .mockImplementationOnce(() => makeQuery([{ total: 0 }]))
      .mockImplementationOnce(() => makeQuery([{ total: 0 }]));
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    const data = res._getJSONData();
    expect(data.funnel.creationRatePct).toBeNull();
    expect(data.validation.unrecognizedPct).toBeNull();
    expect(data.creators.guestPct).toBeNull();
    expect(data.avatars.fallbackRatePct).toBeNull();
    expect(data.totals.avgMessagesPerBot).toBe(0);
  });

  it("returns 500 when a stats query fails", async () => {
    mockGetSessionUserId.mockResolvedValue("admin-1");
    mockIsAdmin.mockResolvedValue(true);
    mockSelect.mockImplementationOnce(() => {
      throw new Error("db exploded");
    });
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});
