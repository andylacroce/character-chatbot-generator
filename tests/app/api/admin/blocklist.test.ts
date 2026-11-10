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

const mockListBlocklist = jest.fn();
const mockAddToBlocklist = jest.fn();
const mockRemoveFromBlocklist = jest.fn();
jest.mock("../../../../src/utils/moderation/characterBlocklist", () => ({
  listBlocklist: (...args: unknown[]) => mockListBlocklist(...args),
  addToBlocklist: (...args: unknown[]) => mockAddToBlocklist(...args),
  removeFromBlocklist: (...args: unknown[]) => mockRemoveFromBlocklist(...args),
}));

const mockRemoveFromAllowlist = jest.fn();
jest.mock("../../../../src/utils/moderation/characterAllowlist", () => ({
  removeFromAllowlist: (...args: unknown[]) => mockRemoveFromAllowlist(...args),
}));

const mockScrubCachedAvatar = jest.fn();
const mockScrubUserBotsByName = jest.fn();
jest.mock("../../../../src/utils/avatar/avatarGeneration", () => ({
  scrubCachedAvatar: (...args: unknown[]) => mockScrubCachedAvatar(...args),
  scrubUserBotsByName: (...args: unknown[]) => mockScrubUserBotsByName(...args),
}));

describe("admin/blocklist API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListBlocklist.mockResolvedValue([]);
    mockAddToBlocklist.mockResolvedValue(undefined);
    mockRemoveFromBlocklist.mockResolvedValue(true);
    mockRemoveFromAllowlist.mockResolvedValue(false);
    mockScrubCachedAvatar.mockResolvedValue(false);
    mockScrubUserBotsByName.mockResolvedValue(0);
  });

  it("returns 401 for a guest (no session)", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in user who isn't an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockIsAdmin.mockResolvedValue(false);
    const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(mockListBlocklist).not.toHaveBeenCalled();
  });

  describe("as an admin", () => {
    beforeEach(() => {
      mockGetSessionUserId.mockResolvedValue("admin-1");
      mockIsAdmin.mockResolvedValue(true);
    });

    it("GET lists every blocklist entry", async () => {
      mockListBlocklist.mockResolvedValueOnce([
        {
          characterName: "elsa",
          displayName: "Elsa",
          reason: "Disney trademark",
          source: "claude",
          createdAt: new Date("2026-01-01"),
        },
      ]);
      const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
      const { req, res } = createMocks({ method: "GET" });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].characterName).toBe("elsa");
    });

    it("POST adds a name with source 'admin', defaulting to category 'content', and scrubs it immediately", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
      const { req, res } = createMocks({
        method: "POST",
        body: { name: "Fake Character", reason: "Testing" },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockAddToBlocklist).toHaveBeenCalledWith(
        "Fake Character",
        "Testing",
        "admin",
        "content",
      );
      // A name is never on both lists — blocking also un-allows it.
      expect(mockRemoveFromAllowlist).toHaveBeenCalledWith("Fake Character");
      // Scrubbed right away, not just for future requests — see module doc comment.
      expect(mockScrubCachedAvatar).toHaveBeenCalledWith("Fake Character");
      expect(mockScrubUserBotsByName).toHaveBeenCalledWith("Fake Character");
    });

    it("POST honors an explicit category: 'copyright'", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
      const { req, res } = createMocks({
        method: "POST",
        body: { name: "Fake Franchise Character", reason: "Testing", category: "copyright" },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockAddToBlocklist).toHaveBeenCalledWith(
        "Fake Franchise Character",
        "Testing",
        "admin",
        "copyright",
      );
    });

    it("POST returns 400 for a missing/blank name", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
      const { req, res } = createMocks({ method: "POST", body: { name: "   " } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(mockAddToBlocklist).not.toHaveBeenCalled();
    });

    it("DELETE removes a name and reports whether it existed", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
      const { req, res } = createMocks({ method: "DELETE", body: { name: "Elsa" } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockRemoveFromBlocklist).toHaveBeenCalledWith("Elsa");
      expect(res._getJSONData()).toEqual({ ok: true, removed: true });
    });

    it("DELETE returns 400 for a missing/blank name", async () => {
      const handler = asHandler(await import("../../../../src/app/api/admin/blocklist/route"));
      const { req, res } = createMocks({ method: "DELETE", body: {} });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(mockRemoveFromBlocklist).not.toHaveBeenCalled();
    });
  });
});
