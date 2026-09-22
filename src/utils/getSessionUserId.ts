/**
 * Resolves the signed-in user's id for a Pages Router API request, or null if the
 * caller is anonymous. Every route that persists per-user data should derive its
 * user id from this — never from a client-supplied field — the same trust boundary
 * proxy.ts already enforces for request origin.
 *
 * Uses next-auth/jwt's `getToken` directly rather than `getServerSession` — it reads the
 * user id from either the session cookie (web) or an `Authorization: Bearer <token>` header
 * (mobile, which can't use a cookie-based session) with no extra code needed for the second
 * case: `getToken` already checks both. The bearer token mobile sends is minted by
 * pages/api/auth/mobile-google-callback.ts using the exact same `encode()` (same secret, no
 * salt — "session token" by convention, see mobileAuthState.ts's own distinct-salt contrast)
 * that produces the web's session cookie, so both decode identically here.
 */

import type { NextApiRequest } from "next";
import { getToken } from "next-auth/jwt";

/** Resolves the signed-in user's id for this request, or null for a guest (see module doc above). */
export async function getSessionUserId(req: NextApiRequest): Promise<string | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return typeof token?.sub === "string" ? token.sub : null;
}
