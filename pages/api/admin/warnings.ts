/**
 * Admin-only, read-only view of the append-only warning log (src/utils/
 * characterWarningLog.ts, src/db/schema.ts's `character_warning_log` table) — every
 * "warning"-level copyright/trademark classification Claude has ever returned,
 * independent of whatever action (if any) was later taken on that name. Backs the
 * /admin/moderation page's "Recently warned" panel. No POST/DELETE here — this is a
 * log, not a manageable list; use pages/api/admin/{allowlist,blocklist}.ts to act on
 * a name found here.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { isAdmin } from "../../../src/utils/isAdmin";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import { listWarnings } from "../../../src/utils/characterWarningLog";

/** Rate limiter: 20 requests per minute per IP, same budget as the other admin routes. */
const adminWarningsRateLimit = createRateLimiter({
  name: "admin-warnings",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for the admin "Recently warned" panel.
 *
 * @swagger
 * /admin/warnings:
 *   get:
 *     summary: List every warning-level classification Claude has ever returned (admin-only)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: The full warning log, newest first
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(adminWarningsRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const userId = await getSessionUserId(req, res);
  if (!userId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!(await isAdmin(req, res))) {
    logEvent(
      "warn",
      "admin_warnings_forbidden",
      "Non-admin user denied access to the warning log",
      sanitizeLogMeta({ userId }),
    );
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const entries = await listWarnings();
  res.status(200).json({ entries });
}
