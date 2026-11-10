/** @jest-environment node */
import { routeRequest } from "../../helpers/routeRequest";

jest.mock("../../../src/utils/server/withRoute", () => ({
  withRoute: (_limit: unknown, handler: unknown) => handler,
}));

const mockGetSessionUserId = jest.fn();
jest.mock("../../../src/utils/account/getSessionUserId", () => ({
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

  describe("guest / no-DB no-op", () => {
    it("GET returns a null name for a guest (no session)", async () => {
      mockGetSessionUserId.mockResolvedValue(null);
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.GET(routeRequest("GET"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: null });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("POST is a no-op for a guest (no session)", async () => {
      mockGetSessionUserId.mockResolvedValue(null);
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.POST(routeRequest("POST", { body: { name: "Andy" } }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ persisted: false });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("is a no-op when signed in but DATABASE_URL is not configured", async () => {
      delete process.env.DATABASE_URL;
      mockGetSessionUserId.mockResolvedValue("user-1");
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.GET(routeRequest("GET"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: null });
    });
  });

  describe("GET (signed in)", () => {
    beforeEach(() => mockGetSessionUserId.mockResolvedValue("user-1"));

    it("returns the stored preferred name", async () => {
      mockWhereSelect.mockResolvedValueOnce([{ preferredName: "Andy" }]);
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.GET(routeRequest("GET"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: "Andy" });
    });

    it("returns null when no row or no name is stored", async () => {
      mockWhereSelect.mockResolvedValueOnce([{ preferredName: null }]);
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.GET(routeRequest("GET"));
      expect(await res.json()).toEqual({ name: null });
    });

    it("returns 500 when the query fails", async () => {
      mockWhereSelect.mockRejectedValueOnce(new Error("db down"));
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.GET(routeRequest("GET"));
      expect(res.status).toBe(500);
    });
  });

  describe("POST (signed in)", () => {
    beforeEach(() => mockGetSessionUserId.mockResolvedValue("user-1"));

    it("rejects a non-string name", async () => {
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.POST(routeRequest("POST", { body: { name: 123 } }));
      expect(res.status).toBe(400);
    });

    it("sanitizes and persists the name", async () => {
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.POST(routeRequest("POST", { body: { name: "  Andy <script> " } }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ persisted: true });
      expect(mockSet).toHaveBeenCalledWith({ preferredName: "Andy script" });
    });

    it("clears the name when given an empty string", async () => {
      const route = await import("../../../src/app/api/user-profile/route");
      await route.POST(routeRequest("POST", { body: { name: "" } }));
      expect(mockSet).toHaveBeenCalledWith({ preferredName: null });
    });

    it("returns 500 when the update fails", async () => {
      mockWhereUpdate.mockRejectedValueOnce(new Error("db down"));
      const route = await import("../../../src/app/api/user-profile/route");
      const res = await route.POST(routeRequest("POST", { body: { name: "Andy" } }));
      expect(res.status).toBe(500);
    });
  });
});
