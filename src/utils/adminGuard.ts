/**
 * Shared sign-in + admin gate for admin API routes — factored out of isAdmin.ts (not
 * added to it) so tests that `jest.mock` the whole isAdmin module still exercise the
 * real 401/403 logic here via their mocked isAdmin/getSessionUserId.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUserId } from "./getSessionUserId";
import { isAdmin } from "./isAdmin";
import { logEvent, sanitizeLogMeta } from "./logger";

/**
 * Combines the sign-in and admin checks every admin API route needs: 401s an anonymous
 * caller, 403s (with a `warn`-level log) a signed-in non-admin, and returns the caller's
 * user id only once both pass. Callers should `return` immediately when this resolves to
 * `null` — the response has already been sent.
 */
export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  options: { event: string; message: string },
): Promise<string | null> {
  const userId = await getSessionUserId(req, res);
  if (!userId) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  if (!(await isAdmin(req, res))) {
    logEvent("warn", options.event, options.message, sanitizeLogMeta({ userId }));
    res.status(403).json({ error: "Not authorized" });
    return null;
  }
  return userId;
}
