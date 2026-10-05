jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => options,
  applyRateLimit: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../../../src/utils/withRequestLog", () => ({
  withRequestLog: (handler: unknown) => handler,
}));
jest.mock("../../../../src/utils/mobileAuthState", () => ({
  signMobileAuthState: jest.fn().mockResolvedValue("signed-state"),
}));
jest.mock("../../../../src/utils/requestBaseUrl", () => ({
  getRequestBaseUrl: () => "https://app.example",
}));
jest.mock("../../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler, { isAllowedRedirectUri } from "../../../../src/pages/api/auth/mobile-auth-start";

describe("isAllowedRedirectUri", () => {
  it.each([
    "character-chatbot-mobile://auth",
    "exp://192.168.1.20:8081/--/auth",
    "exp://10.0.0.5:8081/--/auth",
    "exp://172.20.1.1:8081/--/auth",
    "exp://localhost:8081/--/auth",
    "exp://abc-anonymous-8081.exp.direct/--/auth",
  ])("accepts %s", (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(true);
  });

  it.each([
    "exp://attacker.com/--/auth",
    "exp://192.168.1.20.attacker.com/--/auth",
    "exp://evil.exp.direct.attacker.com/--/auth",
    "exp://192.168.1.20:8081/--/other",
    "exp://192.168.1.20:8081/--/auth?x=1",
    "exp://user:pw@192.168.1.20:8081/--/auth",
    "exp://172.32.0.1:8081/--/auth",
    "character-chatbot-mobile://other",
    "character-chatbot-mobile://auth/extra",
    "character-chatbot-mobile://auth@evil.com",
    "https://app.example/--/auth",
    "javascript:alert(1)",
    "not a url",
    "",
  ])("rejects %s", (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false);
  });
});

describe("mobile-auth-start handler", () => {
  function run(redirectUri: unknown) {
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      redirect: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as NextApiResponse;
    return (handler as (req: NextApiRequest, res: NextApiResponse) => Promise<void>)(
      {
        method: "GET",
        query: { redirect_uri: redirectUri },
        headers: {},
      } as unknown as NextApiRequest,
      res,
    ).then(() => res);
  }

  it("redirects to sign-in for the app's own URI", async () => {
    const res = await run("character-chatbot-mobile://auth");
    expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining("/api/auth/signin"));
  });

  it("rejects a foreign host with a 400 and never starts sign-in", async () => {
    const res = await run("exp://attacker.com/--/auth");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
