/**
 * Admin-only queue of open "Report a problem" reports (src/utils/moderation/contentReports.ts)
 * for the /admin/moderation page. GET lists them; POST marks one resolved. Acting on the
 * reported character (blocking, purging the portrait) uses the existing blocklist and
 * characters routes, then resolves the report.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "../../../utils/account/adminGuard";
import { createRateLimiter, applyRateLimit } from "../../../utils/server/rateLimit";
import { listOpenReports, resolveReport } from "../../../utils/moderation/contentReports";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/server/withRequestLog";

/** Rate limiter: 20 requests per minute per IP, same budget as the other admin routes. */
const adminReportsRateLimit = createRateLimiter({
  name: "admin-reports",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for the admin report queue.
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
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(adminReportsRateLimit, req, res))) return;

  const userId = await requireAdmin(req, res, {
    event: "admin_reports_forbidden",
    message: "Non-admin user denied access to the report queue",
  });
  if (!userId) return;

  if (req.method === "GET") {
    res.status(200).json({ entries: await listOpenReports() });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const id = req.body?.id;
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Valid id required" });
    return;
  }
  if (!(await resolveReport(id))) {
    res.status(500).json({ error: "Failed to resolve report" });
    return;
  }
  logEvent(
    "info",
    "admin_report_resolved",
    "Admin resolved a report",
    sanitizeLogMeta({ userId, reportId: id }),
  );
  res.status(200).json({ ok: true });
}

export default withRequestLog(handler);
