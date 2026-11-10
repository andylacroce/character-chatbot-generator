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

const mockListWarnings = jest.fn();
jest.mock("../../../../src/utils/moderation/characterWarningLog", () => ({
  listWarnings: (...args: unknown[]) => mockListWarnings(...args),
}));

describe("admin/warnings API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListWarnings.mockResolvedValue([]);
  });

  it("returns 401 for a guest (no session)", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    const handler = asHandler(await import("../../../../src/app/api/admin/warnings/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in user who isn't an admin", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockIsAdmin.mockResolvedValue(false);
    const handler = asHandler(await import("../../../../src/app/api/admin/warnings/route"));
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
    const handler = asHandler(await import("../../../../src/app/api/admin/warnings/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].characterName).toBe("elsa");
  });
});
