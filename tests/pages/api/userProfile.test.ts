import { createMocks } from "node-mocks-http";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockWhereSelect = jest.fn();
const mockFrom = jest.fn(() => ({ where: mockWhereSelect }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));

const mockWhereUpdate = jest.fn();
const mockSet = jest.fn(() => ({ where: mockWhereUpdate }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));

const mockDb = { select: mockSelect, update: mockUpdate };
jest.mock("../../../src/db/client", () => ({ getDb: () => mockDb }));

describe("user-profile API", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
    mockWhereSelect.mockResolvedValue([]);
    mockWhereUpdate.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 405 for unsupported methods", async () => {
    const handler = (await import("../../../pages/api/user-profile")).default;
    const { req, res } = createMocks({ method: "DELETE" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  describe("guest / no-DB no-op", () => {
    it("GET returns a null name for a guest (no session)", async () => {
      mockGetSessionUserId.mockResolvedValue(null);
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "GET" });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ name: null });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("POST is a no-op for a guest (no session)", async () => {
      mockGetSessionUserId.mockResolvedValue(null);
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "POST", body: { name: "Andy" } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ persisted: false });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("is a no-op when signed in but DATABASE_URL is not configured", async () => {
      delete process.env.DATABASE_URL;
      mockGetSessionUserId.mockResolvedValue("user-1");
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "GET" });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ name: null });
    });
  });

  describe("GET (signed in)", () => {
    beforeEach(() => mockGetSessionUserId.mockResolvedValue("user-1"));

    it("returns the stored preferred name", async () => {
      mockWhereSelect.mockResolvedValueOnce([{ preferredName: "Andy" }]);
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "GET" });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ name: "Andy" });
    });

    it("returns null when no row or no name is stored", async () => {
      mockWhereSelect.mockResolvedValueOnce([{ preferredName: null }]);
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "GET" });
      await handler(req, res);
      expect(res._getJSONData()).toEqual({ name: null });
    });

    it("returns 500 when the query fails", async () => {
      mockWhereSelect.mockRejectedValueOnce(new Error("db down"));
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "GET" });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
    });
  });

  describe("POST (signed in)", () => {
    beforeEach(() => mockGetSessionUserId.mockResolvedValue("user-1"));

    it("rejects a non-string name", async () => {
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "POST", body: { name: 123 } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    });

    it("sanitizes and persists the name", async () => {
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "POST", body: { name: "  Andy <script> " } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ persisted: true });
      expect(mockSet).toHaveBeenCalledWith({ preferredName: "Andy script" });
    });

    it("clears the name when given an empty string", async () => {
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "POST", body: { name: "" } });
      await handler(req, res);
      expect(mockSet).toHaveBeenCalledWith({ preferredName: null });
    });

    it("returns 500 when the update fails", async () => {
      mockWhereUpdate.mockRejectedValueOnce(new Error("db down"));
      const handler = (await import("../../../pages/api/user-profile")).default;
      const { req, res } = createMocks({ method: "POST", body: { name: "Andy" } });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
    });
  });
});
