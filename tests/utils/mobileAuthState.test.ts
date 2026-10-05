// next-auth/jwt pulls in an ESM-only jose that Jest can't load, so a stand-in that, like the
// real one, binds a token to its secret and salt and rejects anything else.
jest.mock("next-auth/jwt", () => ({
  encode: async ({ token, secret, salt }: { token: object; secret: string; salt: string }) =>
    Buffer.from(JSON.stringify({ token, secret, salt })).toString("base64url"),
  decode: async ({ token, secret, salt }: { token: string; secret: string; salt: string }) => {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString());
    if (parsed.secret !== secret || parsed.salt !== salt) throw new Error("bad token");
    return parsed.token;
  },
}));

import { signMobileAuthState, verifyMobileAuthState } from "../../src/utils/mobileAuthState";

describe("mobileAuthState", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, NEXTAUTH_SECRET: "test-secret-for-state" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("round-trips a redirect URI through the signed state", async () => {
    const state = await signMobileAuthState("character-chatbot-mobile://auth");
    await expect(verifyMobileAuthState(state)).resolves.toEqual({
      redirectUri: "character-chatbot-mobile://auth",
    });
  });

  it("rejects garbage, a tampered state, and a state signed with another secret", async () => {
    await expect(verifyMobileAuthState("not-a-jwe")).resolves.toBeNull();
    const state = await signMobileAuthState("character-chatbot-mobile://auth");
    await expect(verifyMobileAuthState(`${state.slice(0, -4)}AAAA`)).resolves.toBeNull();
    process.env.NEXTAUTH_SECRET = "a-different-secret";
    await expect(verifyMobileAuthState(state)).resolves.toBeNull();
  });
});
