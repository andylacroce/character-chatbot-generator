/**
 * Admin-only, read-only view of the append-only warning log (src/utils/
 * characterWarningLog.ts, src/db/schema.ts's `character_warning_log` table) — every
 * "warning"-level copyright/trademark classification Claude has ever returned,
 * independent of whatever action (if any) was later taken on that name. Backs the
 * /admin/moderation page's "Recently warned" panel. No POST/DELETE here — this is a
 * log, not a manageable list; use app/api/admin/{allowlist,blocklist}/route.ts to act on
 * a name found here.
 */

import { adminRoute } from "../../../../utils/account/adminGuard";
import { listWarnings } from "../../../../utils/moderation/characterWarningLog";

const LIMIT = {
  name: "admin-warnings",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

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
 *       429:
 *         description: Rate limit exceeded
 */
export const GET = adminRoute(
  LIMIT,
  {
    event: "admin_warnings_forbidden",
    message: "Non-admin user denied access to the warning log",
  },
  async () => Response.json({ entries: await listWarnings() }),
);
