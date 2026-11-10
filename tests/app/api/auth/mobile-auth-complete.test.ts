/** @jest-environment node */
import { asHandler } from "../../../helpers/asHandler";
const mockGetToken = jest.fn();
const mockEncode = jest.fn();
jest.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
  encode: (...args: unknown[]) => mockEncode(...args),
}));
const mockVerify = jest.fn();
jest.mock("../../../../src/utils/account/mobileAuthState", () => ({
  verifyMobileAuthState: (...args: unknown[]) => mockVerify(...args),
}));
jest.mock("../../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

import type { NextApiRequest, NextApiResponse } from "next";
import * as route from "../../../../src/app/api/auth/mobile-auth-complete/route";
const handler = asHandler(route);

const REDIRECT = "character-chatbot-mobile://auth";

function run(query: Record<string, unknown>, method = "GET") {
  const res = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    end: jest.fn(),
    redirect: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;
  return (handler as (req: NextApiRequest, res: NextApiResponse) => Promise<void>)(
    { method, query, headers: {} } as unknown as NextApiRequest,
    res,
  ).then(() => res);
}

describe("mobile-auth-complete", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, NEXTAUTH_SECRET: "secret" };
    mockVerify.mockResolvedValue({ redirectUri: REDIRECT });
    mockGetToken.mockResolvedValue({ sub: "u1", email: "a@b.c", name: "Ada", picture: "x" });
    mockEncode.mockResolvedValue("bearer-token");
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("mints a bearer token with only sub/email/name and redirects to the verified URI", async () => {
    const res = await run({ state: "s" });
    expect(mockEncode).toHaveBeenCalledWith({
      token: { sub: "u1", email: "a@b.c", name: "Ada" },
      secret: "secret",
    });
    expect(res.redirect).toHaveBeenCalledWith(302, `${REDIRECT}?token=bearer-token`);
  });

  it("rejects a missing, invalid or expired state without minting anything", async () => {
    expect((await run({})).status).toHaveBeenCalledWith(400);
    mockVerify.mockResolvedValue(null);
    expect((await run({ state: "bad" })).status).toHaveBeenCalledWith(400);
    expect(mockEncode).toHaveBeenCalledTimes(0);
  });

  it("redirects back with an error when sign-in did not complete", async () => {
    mockGetToken.mockResolvedValue(null);
    const res = await run({ state: "s" });
    expect(res.redirect).toHaveBeenCalledWith(302, `${REDIRECT}?error=not_signed_in`);
    expect(mockEncode).toHaveBeenCalledTimes(0);
  });

  it("redirects back with an error when NEXTAUTH_SECRET is missing", async () => {
    delete process.env.NEXTAUTH_SECRET;
    const res = await run({ state: "s" });
    expect(res.redirect).toHaveBeenCalledWith(302, `${REDIRECT}?error=server_misconfigured`);
  });

  it("nulls non-string email/name claims", async () => {
    mockGetToken.mockResolvedValue({ sub: "u1", email: 1, name: {} });
    await run({ state: "s" });
    expect(mockEncode.mock.calls[0][0].token).toEqual({ sub: "u1", email: null, name: null });
  });
});
