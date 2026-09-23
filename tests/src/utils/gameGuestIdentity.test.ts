import type { NextApiRequest, NextApiResponse } from "next";
import { ensureGuestId, getGuestId } from "../../../src/utils/gameGuestIdentity";

describe("game guest identity", () => {
  it("issues an HTTP-only cookie and reuses its hashed identity", () => {
    const res = { setHeader: jest.fn() } as unknown as NextApiResponse;
    const firstReq = { cookies: {} } as NextApiRequest;
    const guestId = ensureGuestId(firstReq, res);
    const cookie = (res.setHeader as jest.Mock).mock.calls[0][1] as string;
    expect(cookie).toContain("HttpOnly; SameSite=Lax");
    expect(cookie).toContain("Max-Age=31536000");
    const token = cookie.match(/portrayal-game-guest=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(guestId).not.toBe(token);
    const secondReq = { cookies: { "portrayal-game-guest": token } } as unknown as NextApiRequest;
    expect(getGuestId(secondReq)).toBe(guestId);
    expect(ensureGuestId(secondReq, res)).toBe(guestId);
    expect(res.setHeader).toHaveBeenCalledTimes(1);
  });

  it("does not accept a malformed cookie as an identity", () => {
    expect(
      getGuestId({ cookies: { "portrayal-game-guest": "short" } } as unknown as NextApiRequest),
    ).toBeNull();
  });

  it("accepts the mobile app's x-game-guest header, without issuing a cookie", () => {
    const token = "a".repeat(43);
    const res = { setHeader: jest.fn() } as unknown as NextApiResponse;
    const req = { cookies: {}, headers: { "x-game-guest": token } } as unknown as NextApiRequest;
    const fromCookie = getGuestId({
      cookies: { "portrayal-game-guest": token },
    } as unknown as NextApiRequest);
    expect(ensureGuestId(req, res)).toBe(fromCookie);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(
      getGuestId({
        cookies: {},
        headers: { "x-game-guest": "short" },
      } as unknown as NextApiRequest),
    ).toBeNull();
  });
});
