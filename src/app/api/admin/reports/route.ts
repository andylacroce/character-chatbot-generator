/**
 * Admin-only queue of open "Report a problem" reports (src/utils/moderation/contentReports.ts)
 * for the /admin/moderation page. GET lists them; POST marks one resolved. Acting on the
 * reported character (blocking, purging the portrait) uses the existing blocklist and
 * characters routes, then resolves the report.
 */

import { adminRoute } from "../../../../utils/account/adminGuard";
import { listOpenReports, resolveReport } from "../../../../utils/moderation/contentReports";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";
import { readJson } from "../../../../utils/server/withRoute";

const LIMIT = {
  name: "admin-reports",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

/**
 * Lists open problem reports and marks one resolved.
 *
 * @swagger
 * /admin/reports:
 *   get:
 *     summary: List open reports (admin-only)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Open reports for this environment, newest first
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *   post:
 *     summary: Mark a report resolved (admin-only)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Resolved
 *       400:
 *         description: Valid id required
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Database failure
 */
const FORBIDDEN = {
  event: "admin_reports_forbidden",
  message: "Non-admin user denied access to the report queue",
};

export const GET = adminRoute(LIMIT, FORBIDDEN, async () =>
  Response.json({ entries: await listOpenReports() }),
);

/** POST: mark one report resolved. */
export const POST = adminRoute(LIMIT, FORBIDDEN, async (req, userId) => {
  const { id } = await readJson(req);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Valid id required" }, { status: 400 });
  }
  if (!(await resolveReport(id))) {
    return Response.json({ error: "Failed to resolve report" }, { status: 500 });
  }
  logEvent(
    "info",
    "admin_report_resolved",
    "Admin resolved a report",
    sanitizeLogMeta({ userId, reportId: id }),
  );
  return Response.json({ ok: true });
});
