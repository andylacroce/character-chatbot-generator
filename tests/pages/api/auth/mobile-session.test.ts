const mockGetToken = jest.fn();
jest.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));
const mockApplyRateLimit = jest.fn();
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => options,
  applyRateLimit: (...args: unknown[]) => mockApplyRateLimit(...args),
}));
jest.mock("../../../../src/utils/withRequestLog", () => ({
  withRequestLog: (handler: unknown) => handler,
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../../../../src/pages/api/auth/mobile-session";

function run(method = "GET") {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    end: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;
  return (handler as (req: NextApiRequest, res: NextApiResponse) => Promise<void>)(
    { method, headers: {} } as unknown as NextApiRequest,
    res,
  ).then(() => res);
}

describe("mobile-session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyRateLimit.mockResolvedValue(true);
  });

  it("returns the bearer token's identity", async () => {
    mockGetToken.mockResolvedValue({ sub: "u1", email: "a@b.c", name: "Ada" });
    const res = await run();
    expect(res.json).toHaveBeenCalledWith({ userId: "u1", email: "a@b.c", name: "Ada" });
  });

  it("returns all-null fields when there is no valid token", async () => {
    mockGetToken.mockResolvedValue(null);
    const res = await run();
    expect(res.json).toHaveBeenCalledWith({ userId: null, email: null, name: null });
  });

  it("ignores non-string claims", async () => {
    mockGetToken.mockResolvedValue({ sub: 5, email: {}, name: [] });
    const res = await run();
    expect(res.json).toHaveBeenCalledWith({ userId: null, email: null, name: null });
  });

  it("rejects other methods and stops when rate limited", async () => {
    expect((await run("POST")).status).toHaveBeenCalledWith(405);
    mockApplyRateLimit.mockResolvedValue(false);
    await run();
    expect(mockGetToken).toHaveBeenCalledTimes(0);
  });
});
