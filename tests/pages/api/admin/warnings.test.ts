import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockIsAdmin = jest.fn();
jest.mock("../../../../src/utils/isAdmin", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

const mockListWarnings = jest.fn();
jest.mock("../../../../src/utils/characterWarningLog", () => ({
  listWarnings: (...args: unknown[]) => mockListWarnings(...args),
}));

jest.mock("express-rate-limit", () => {
  return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

describe("admin/warnings API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListWarnings.mockResolvedValue([]);
  });

  it("returns 405 for non-GET methods", async () => {
    const handler = (await import("../../../../src/pages/api/admin/warnings")).default;
    const { req, res } = createMocks({ method: "POST" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 401 for a guest (no session)", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const handler = (await import("../../../../src/pages/api/admin/warnings")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in user who isn't an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockIsAdmin.mockResolvedValue(false);
    const handler = (await import("../../../../src/pages/api/admin/warnings")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(mockListWarnings).not.toHaveBeenCalled();
  });

  it("returns the warning log for an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("admin-1");
    mockIsAdmin.mockResolvedValue(true);
    mockListWarnings.mockResolvedValueOnce([
      { characterName: "elsa", displayName: "Elsa", reason: "Disney", createdAt: new Date() },
    ]);
    const handler = (await import("../../../../src/pages/api/admin/warnings")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].characterName).toBe("elsa");
  });
});
