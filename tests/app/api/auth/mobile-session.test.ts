/** @jest-environment node */
import { asHandler } from "../../../helpers/asHandler";
const mockGetToken = jest.fn();
jest.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));

import type { NextApiRequest, NextApiResponse } from "next";
import * as route from "../../../../src/app/api/auth/mobile-session/route";
const handler = asHandler(route);

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
});
