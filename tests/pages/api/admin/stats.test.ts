import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockIsAdmin = jest.fn();
jest.mock("../../../../src/utils/isAdmin", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

/** A minimal chainable stand-in for a Drizzle query builder: every chain method
 * returns itself, and awaiting it resolves to the canned rows — good enough for
 * exercising the route's response assembly without re-testing Drizzle itself. */
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

const cannedRow = {
  total: 3,
  name: "bot_created",
  day: "2026-01-01",
  provider: "cloudflare",
  warningLevel: "none",
  guest: "false",
};
const mockSelect = jest.fn(() => makeQuery([cannedRow]));
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
    expect(res._getJSONData()).toEqual({
      eventCounts: [],
      dailyCounts: [],
      avatarProviders: [],
      validationOutcomes: [],
      botCreators: [],
      totals: { bots: 0, messages: 0 },
    });
  });

  it("returns aggregate stats for an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("admin-1");
    mockIsAdmin.mockResolvedValue(true);
    const handler = (await import("../../../../pages/api/admin/stats")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.eventCounts).toEqual([cannedRow]);
    expect(data.totals).toEqual({ bots: 3, messages: 3 });
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
