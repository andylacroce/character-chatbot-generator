/** @jest-environment node */
import { NextRequest } from "next/server";
import {
  CLEAR_GUEST_COOKIE,
  ensureGuestId,
  getGuestId,
} from "../../../src/utils/game/gameGuestIdentity";

const request = (headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/guess-who/start", { headers });

describe("game guest identity", () => {
  it("issues an HTTP-only cookie and reuses its hashed identity", () => {
    const first = ensureGuestId(request());
    expect(first.setCookie).toContain("HttpOnly; SameSite=Lax");
    expect(first.setCookie).toContain("Max-Age=31536000");
    const token = first.setCookie?.match(/portrayal-game-guest=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(first.guestId).not.toBe(token);

    const returning = request({ cookie: `portrayal-game-guest=${token}` });
    expect(getGuestId(returning)).toBe(first.guestId);
    expect(ensureGuestId(returning)).toEqual({ guestId: first.guestId, setCookie: null });
  });

  it("does not accept a malformed cookie as an identity", () => {
    expect(getGuestId(request({ cookie: "portrayal-game-guest=short" }))).toBeNull();
  });

  it("accepts the mobile app's x-game-guest header, without issuing a cookie", () => {
    const token = "a".repeat(43);
    const fromCookie = getGuestId(request({ cookie: `portrayal-game-guest=${token}` }));
    expect(ensureGuestId(request({ "x-game-guest": token }))).toEqual({
      guestId: fromCookie,
      setCookie: null,
    });
    expect(getGuestId(request({ "x-game-guest": "short" }))).toBeNull();
  });

  it("expires the cookie with CLEAR_GUEST_COOKIE", () => {
    expect(CLEAR_GUEST_COOKIE).toContain("portrayal-game-guest=;");
    expect(CLEAR_GUEST_COOKIE).toContain("Max-Age=0");
  });
});
