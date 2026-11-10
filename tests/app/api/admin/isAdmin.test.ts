/** @jest-environment node */
import { asHandler } from "../../../helpers/asHandler";
import { createMocks } from "node-mocks-http";

const mockIsAdmin = jest.fn();
jest.mock("../../../../src/utils/account/isAdmin", () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

describe("admin/is-admin API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns isAdmin: true for an admin session", async () => {
    mockIsAdmin.mockResolvedValue(true);
    const handler = asHandler(await import("../../../../src/app/api/admin/is-admin/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ isAdmin: true });
  });

  it("returns isAdmin: false for a guest or non-admin — never 401/403", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const handler = asHandler(await import("../../../../src/app/api/admin/is-admin/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ isAdmin: false });
  });

  it("fails closed to isAdmin: false when the check throws", async () => {
    mockIsAdmin.mockRejectedValue(new Error("session lookup failed"));
    const handler = asHandler(await import("../../../../src/app/api/admin/is-admin/route"));
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ isAdmin: false });
  });
});
