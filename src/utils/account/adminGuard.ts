/**
 * Shared sign-in + admin gate for admin API routes — factored out of isAdmin.ts (not
 * added to it) so tests that `jest.mock` the whole isAdmin module still exercise the
 * real 401/403 logic here via their mocked isAdmin/getSessionUserId.
 */

import type { NextRequest } from "next/server";
import { getSessionUserId } from "./getSessionUserId";
import { isAdmin } from "./isAdmin";
import { logEvent, sanitizeLogMeta } from "../logger";
import { withRoute, type RouteLimit } from "../server/withRoute";

/**
 * Wraps an admin route handler with the per-IP limit, a 401 for an anonymous caller, and a 403
 * (with a `warn`-level log) for a signed-in non-admin. The handler runs, with the caller's
 * user id, only once both checks pass.
 */
export function adminRoute(
  limit: RouteLimit,
  forbidden: { event: string; message: string },
  handler: (req: NextRequest, userId: string) => Promise<Response>,
) {
  return withRoute(limit, async (req) => {
    const userId = await getSessionUserId(req);
    if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
    if (!(await isAdmin())) {
      logEvent("warn", forbidden.event, forbidden.message, sanitizeLogMeta({ userId }));
      return Response.json({ error: "Not authorized" }, { status: 403 });
    }
    return handler(req, userId);
  });
}

/**
 * Reads and trims the required `name` from an admin mutation's JSON body, or returns the 400
 * response to send when it's missing or blank.
 */
export function readAdminName(body: { name?: unknown }): string | Response {
  const { name } = body;
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Valid name required" }, { status: 400 });
  }
  return name.trim();
}
