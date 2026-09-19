/** Anonymous browser identity for durable, claimable guest game scores. */

import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const COOKIE_NAME = "portrayal-game-guest";

/** Hashes the unguessable cookie so raw guest credentials never enter the database. */
function hashGuestToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Reads a valid existing guest identity without creating one. */
export function getGuestId(req: NextApiRequest): string | null {
  const token = req.cookies?.[COOKIE_NAME];
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? hashGuestToken(token)
    : null;
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
