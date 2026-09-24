import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

jest.mock("../../../src/utils/rateLimit", () => ({
  createRateLimiter: () => ({ limiterName: "test" }),
  applyRateLimit: () => Promise.resolve(true),
}));

const mockDeleteUserBlobs = jest.fn();
jest.mock("../../../src/utils/userBlobs", () => ({
  deleteUserBlobs: (...args: unknown[]) => mockDeleteUserBlobs(...args),
}));

const { gameGuestProfiles, gameResults, users, verificationTokens } =
  jest.requireActual("../../../src/db/schema");

const mockSelectWhere = jest.fn();
const mockSelect = jest.fn(() => ({ from: () => ({ where: mockSelectWhere }) }));
const deletedTables: unknown[] = [];
const mockDelete = jest.fn((table: unknown) => {
  deletedTables.push(table);
  return {
    where: () =>
      Object.assign(Promise.resolve([]), {
        returning: () => Promise.resolve(table === users ? [{ email: "person@example.com" }] : []),
      }),
  };
});
jest.mock("../../../src/db/client", () => ({
  getDb: () => ({ select: mockSelect, delete: mockDelete }),
}));

const GUEST_TOKEN = "a".repeat(43);

describe("account API", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    deletedTables.length = 0;
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
    mockSelectWhere.mockResolvedValue([{ avatarUrl: "https://x/a.png" }, { avatarUrl: null }]);
    mockDeleteUserBlobs.mockResolvedValue(0);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const run = async (opts: Parameters<typeof createMocks>[0] = { method: "DELETE" }) => {
    const handler = (await import("../../../src/pages/api/account")).default;
    const { req, res } = createMocks(opts);
    await handler(req, res);
    return res;
  };

  it("rejects methods other than DELETE", async () => {
    const res = await run({ method: "POST" });
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 401 for a guest", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const res = await run();
    expect(res._getStatusCode()).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("no-ops without DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    mockGetSessionUserId.mockResolvedValue("user-1");
    const res = await run();
    expect(res._getJSONData()).toEqual({ deleted: false });
  });

  it("deletes the user, tokens, guest rows, and the user's blobs", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const res = await run({ method: "DELETE", cookies: { "portrayal-game-guest": GUEST_TOKEN } });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ deleted: true });
    expect(deletedTables).toEqual(
      expect.arrayContaining([users, verificationTokens, gameResults, gameGuestProfiles]),
    );
    expect(mockDeleteUserBlobs).toHaveBeenCalledWith("user-1", ["https://x/a.png", null]);
    expect(res.getHeader("Set-Cookie")).toContain("Max-Age=0");
  });

  it("returns 500 when the database delete fails", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockSelectWhere.mockRejectedValueOnce(new Error("db down"));
    const res = await run();
    expect(res._getStatusCode()).toBe(500);
    expect(mockDeleteUserBlobs).not.toHaveBeenCalled();
  });

  it("still reports success when blob cleanup fails after the account is gone", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockDeleteUserBlobs.mockRejectedValue(new Error("blob down"));
    const res = await run();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ deleted: true });
  });
});
