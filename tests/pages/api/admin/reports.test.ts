import { createMocks } from "node-mocks-http";

jest.mock("../../../../src/utils/account/getSessionUserId", () => ({
  getSessionUserId: jest.fn().mockResolvedValue("admin-1"),
}));
jest.mock("../../../../src/utils/account/isAdmin", () => ({
  isAdmin: jest.fn().mockResolvedValue(true),
}));

const mockList = jest.fn();
const mockResolve = jest.fn();
jest.mock("../../../../src/utils/moderation/contentReports", () => ({
  listOpenReports: (...args: unknown[]) => mockList(...args),
  resolveReport: (...args: unknown[]) => mockResolve(...args),
}));

jest.mock("express-rate-limit", () => {
  return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

async function call(method: string, body?: object) {
  const handler = (await import("../../../../src/pages/api/admin/reports")).default;
  const { req, res } = createMocks({ method: method as "GET", body });
  await handler(req, res);
  return res;
}

describe("admin/reports API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue([{ id: 1 }]);
    mockResolve.mockResolvedValue(true);
  });

  it("lists open reports", async () => {
    const res = await call("GET");
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ entries: [{ id: 1 }] });
  });

  it("resolves a report by integer id", async () => {
    expect((await call("POST", { id: 4 })).statusCode).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith(4);
  });

  it("rejects a non-integer id", async () => {
    expect((await call("POST", { id: "4" })).statusCode).toBe(400);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("returns 500 when the update fails", async () => {
    mockResolve.mockResolvedValue(false);
    expect((await call("POST", { id: 4 })).statusCode).toBe(500);
  });

  it("rejects other methods", async () => {
    expect((await call("DELETE")).statusCode).toBe(405);
  });
});
