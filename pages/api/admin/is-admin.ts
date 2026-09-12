/**
 * Cheap, client-visible admin check — lets the account menu (see useAccountMenu.tsx)
 * decide whether to show the "Admin Stats" link without ever running the real aggregate
 * queries in /api/admin/stats.ts just to make that decision. No DB query at all: just
 * the same session + ADMIN_EMAILS check that route already gates on.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { isAdmin } from "../../../src/utils/isAdmin";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";

/** Rate limiter: 30 requests per minute per IP — cheap enough to allow a generous budget. */
const isAdminRateLimit = createRateLimiter({
  name: "admin-is-admin",
  max: 30,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler reporting whether the caller is a signed-in admin.
 *
 * @swagger
 * /admin/is-admin:
 *   get:
 *     summary: Report whether the signed-in caller is an admin
 *     description: >
 *       Always 200 — never 401/403, since this exists purely to decide whether to show
 *       an "Admin Stats" nav link, not to gate access to anything itself (the real
 *       /admin/stats endpoint enforces its own access control independently). Fails
 *       closed to false on any error, same as /api/admin/stats.
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Admin status for the current session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isAdmin:
 *                   type: boolean
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(isAdminRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const admin = await isAdmin(req, res).catch((err) => {
    // Recoverable and worth a human's attention: the account menu just won't show the
    // admin link this request, but a broken isAdmin() check (e.g. an auth/session
    // problem) is unusual enough to be worth a trace rather than a silent swallow.
    logEvent(
      "warn",
      "admin_is_admin_check_failed",
      "isAdmin check threw; failing closed to false",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return false;
  });
  res.status(200).json({ isAdmin: admin });
}
