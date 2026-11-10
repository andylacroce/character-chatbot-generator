/**
 * Anonymous identity for durable, claimable guest game scores. A browser holds its secret
 * in an HTTP-only cookie; the mobile app, which mints and keeps its own secret in secure
 * storage instead of relying on a native cookie jar, sends the same kind of secret in the
 * `x-game-guest` header. Either way only a hash of it ever reaches the database.
 */

import crypto from "crypto";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "portrayal-game-guest";
const HEADER_NAME = "x-game-guest";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Hashes the unguessable secret so raw guest credentials never enter the database. */
function hashGuestToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Reads a valid existing guest identity without creating one. */
export function getGuestId(req: NextRequest): string | null {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? req.headers.get(HEADER_NAME);
  return token && TOKEN_PATTERN.test(token) ? hashGuestToken(token) : null;
}

/**
 * Returns this guest's identity, minting one if they have none. A newly minted identity comes
 * with the `Set-Cookie` value the caller must put on its response (a persistent, HTTP-only
 * browser cookie); an existing one needs no cookie.
 */
export function ensureGuestId(req: NextRequest): { guestId: string; setCookie: string | null } {
  const existing = getGuestId(req);
  if (existing) return { guestId: existing, setCookie: null };
  const token = crypto.randomBytes(32).toString("base64url");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    guestId: hashGuestToken(token),
    setCookie: `${COOKIE_NAME}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
  };
}

/** `Set-Cookie` value that expires this browser's guest identity, so its next game mints a fresh one. */
export const CLEAR_GUEST_COOKIE = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
