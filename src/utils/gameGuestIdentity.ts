/**
 * Anonymous identity for durable, claimable guest game scores. A browser holds its secret
 * in an HTTP-only cookie; the mobile app, which mints and keeps its own secret in secure
 * storage instead of relying on a native cookie jar, sends the same kind of secret in the
 * `x-game-guest` header. Either way only a hash of it ever reaches the database.
 */

import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const COOKIE_NAME = "portrayal-game-guest";
const HEADER_NAME = "x-game-guest";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Hashes the unguessable secret so raw guest credentials never enter the database. */
function hashGuestToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Reads a valid existing guest identity without creating one. */
export function getGuestId(req: NextApiRequest): string | null {
  const token = req.cookies?.[COOKIE_NAME] ?? req.headers?.[HEADER_NAME];
  return typeof token === "string" && TOKEN_PATTERN.test(token) ? hashGuestToken(token) : null;
}

/** Issues a persistent, HTTP-only browser identity if this guest has none. */
export function ensureGuestId(req: NextApiRequest, res: NextApiResponse): string {
  const existing = getGuestId(req);
  if (existing) return existing;
  const token = crypto.randomBytes(32).toString("base64url");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
  );
  return hashGuestToken(token);
}

/** Expires this browser's guest identity cookie, so its next game mints a fresh one. */
export function clearGuestId(res: NextApiResponse): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}
