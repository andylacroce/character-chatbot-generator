/** @jest-environment node */
import { asHandler } from "../../../helpers/asHandler";
import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/account/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockIsAdmin = jest.fn();
jest.mock("../../../../src/utils/account/isAdmin", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

const mockListAllowlist = jest.fn();
const mockAddToAllowlist = jest.fn();
const mockRemoveFromAllowlist = jest.fn();
jest.mock("../../../../src/utils/moderation/characterAllowlist", () => ({
  listAllowlist: (...args: unknown[]) => mockListAllowlist(...args),
  addToAllowlist: (...args: unknown[]) => mockAddToAllowlist(...args),
  removeFromAllowlist: (...args: unknown[]) => mockRemoveFromAllowlist(...args),
}));

const mockRemoveFromBlocklist = jest.fn();
jest.mock("../../../../src/utils/moderation/characterBlocklist", () => ({
  removeFromBlocklist: (...args: unknown[]) => mockRemoveFromBlocklist(...args),
}));

describe("admin/allowlist API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListAllowlist.mockResolvedValue([]);
    mockAddToAllowlist.mockResolvedValue(undefined);
    mockRemoveFromAllowlist.mockResolvedValue(true);
    mockRemoveFromBlocklist.mockResolvedValue(false);
  });

  it("returns 401 for a guest (no session)", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const handler = asHandler(await import("../../../../src/app/api/admin/allowlist/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in user who isn't an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockIsAdmin.mockResolvedValue(false);
    const handler = asHandler(await import("../../../../src/app/api/admin/allowlist/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(mockListAllowlist).not.toHaveBeenCalled();
  });

  describe("as an admin", () => {
    beforeEach(() => {
      mockGetSessionUserId.mockResolvedValue("admin-1");
      mockIsAdmin.mockResolvedValue(true);
    });

    it("GET lists every allowlist entry", async () => {
      mockListAllowlist.mockResolvedValueOnce([
        {
          characterName: "alice munro",
          displayName: "Alice Munro",
          reason: "Real person, not a corporate character",
          source: "admin",
          createdAt: new Date("2026-01-01"),
        },
      ]);
      const handler = asHandler(await import("../../../../src/app/api/admin/allowlist/route"));
      const { req, res } = createMocks({ method: "GET" });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].characterName).toBe("alice munro");
    });

    it("POST adds a name and un-blocks it", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/allowlist/route"));
      const { req, res } = createMocks({
        method: "POST",
        body: { name: "Alice Munro", reason: "Real person" },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockAddToAllowlist).toHaveBeenCalledWith("Alice Munro", "Real person");
      // A name is never on both lists — allowing also un-blocks it.
      expect(mockRemoveFromBlocklist).toHaveBeenCalledWith("Alice Munro");
    });

    it("POST returns 400 for a missing/blank name", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/allowlist/route"));
      const { req, res } = createMocks({ method: "POST", body: { name: "   " } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(mockAddToAllowlist).not.toHaveBeenCalled();
    });

    it("DELETE removes a name and reports whether it existed", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/allowlist/route"));
      const { req, res } = createMocks({ method: "DELETE", body: { name: "Alice Munro" } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockRemoveFromAllowlist).toHaveBeenCalledWith("Alice Munro");
      expect(res._getJSONData()).toEqual({ ok: true, removed: true });
    });

    it("DELETE returns 400 for a missing/blank name", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/allowlist/route"));
      const { req, res } = createMocks({ method: "DELETE", body: {} });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(mockRemoveFromAllowlist).not.toHaveBeenCalled();
    });
  });
});
