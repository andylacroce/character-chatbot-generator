import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockIsAdmin = jest.fn();
jest.mock("../../../../src/utils/isAdmin", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

const mockPurgeCachedAvatar = jest.fn();
const mockRegenerateCachedAvatar = jest.fn();
jest.mock("../../../../src/utils/avatarGeneration", () => ({
  purgeCachedAvatar: (...args: unknown[]) => mockPurgeCachedAvatar(...args),
  regenerateCachedAvatar: (...args: unknown[]) => mockRegenerateCachedAvatar(...args),
}));

const mockClearCharactersCache = jest.fn();
jest.mock("../../../../src/utils/charactersWall", () => ({
  clearCharactersCache: () => mockClearCharactersCache(),
}));

jest.mock("express-rate-limit", () => {
  return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

async function call(method: "GET" | "DELETE" | "POST", body?: unknown) {
  const handler = (await import("../../../../src/pages/api/admin/characters")).default;
  const { req, res } = createMocks({ method, body: body as Record<string, unknown> });
  await handler(req, res);
  return res;
}

describe("admin/characters API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionUserId.mockResolvedValue("admin-1");
    mockIsAdmin.mockResolvedValue(true);
    mockPurgeCachedAvatar.mockResolvedValue(true);
    mockRegenerateCachedAvatar.mockResolvedValue("https://img/new.png");
  });

  it("returns 401 for a guest", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    expect((await call("DELETE", { name: "Ada" })).statusCode).toBe(401);
    expect(mockPurgeCachedAvatar).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in non-admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    expect((await call("DELETE", { name: "Ada" })).statusCode).toBe(403);
    expect(mockPurgeCachedAvatar).not.toHaveBeenCalled();
  });

  it("rejects methods other than DELETE and POST", async () => {
    expect((await call("GET")).statusCode).toBe(405);
  });

  it("requires a name", async () => {
    expect((await call("DELETE", { name: "  " })).statusCode).toBe(400);
    expect(mockPurgeCachedAvatar).not.toHaveBeenCalled();
  });

  it("purges the trimmed name and reports whether a row existed", async () => {
    const res = await call("DELETE", { name: " Ada Lovelace " });
    expect(mockPurgeCachedAvatar).toHaveBeenCalledWith("Ada Lovelace");
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, removed: true });
    expect(mockClearCharactersCache).toHaveBeenCalled();
  });

  it("regenerates on POST and returns the new portrait URL", async () => {
    const res = await call("POST", { name: " Ada Lovelace " });
    expect(mockRegenerateCachedAvatar).toHaveBeenCalledWith("Ada Lovelace");
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, avatarUrl: "https://img/new.png" });
    expect(mockClearCharactersCache).toHaveBeenCalled();
  });

  it("returns 502 when no portrait could be generated", async () => {
    mockRegenerateCachedAvatar.mockResolvedValue(null);
    expect((await call("POST", { name: "Ada" })).statusCode).toBe(502);
  });

  it("keeps non-admins and guests out of regenerate too", async () => {
    mockIsAdmin.mockResolvedValue(false);
    expect((await call("POST", { name: "Ada" })).statusCode).toBe(403);
    expect(mockRegenerateCachedAvatar).not.toHaveBeenCalled();
  });

  it("returns 500 when the purge fails", async () => {
    mockPurgeCachedAvatar.mockRejectedValue(new Error("db down"));
    expect((await call("DELETE", { name: "Ada" })).statusCode).toBe(500);
  });

  it("returns 500 when regeneration throws", async () => {
    mockRegenerateCachedAvatar.mockRejectedValue(new Error("db down"));
    expect((await call("POST", { name: "Ada" })).statusCode).toBe(500);
  });
});
