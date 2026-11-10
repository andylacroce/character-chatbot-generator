/**
 * Internal, admin-only aggregate stats over analytics_events (and bots/messages counts),
 * backing the /admin page. Not linked from any nav — see src/utils/account/isAdmin.ts for the
 * access-control story (fails closed with no ADMIN_EMAILS configured, and refuses admin
 * status entirely on a Vercel Preview deployment, whose sign-in stub issues a session for
 * any typed-in email with no verification at all).
 *
 * Every derived rate (creation rate, fallback rate, guest share, etc.) is computed here
 * rather than left for the client to infer from raw counts — the raw `analytics_events`
 * rows on their own (boolean strings in jsonb metadata, several unrelated event types
 * sharing one table) are ambiguous without knowing their recording call sites.
 *
 * Both guessing games' stats sections are built by the same `aggregateGameStats` helper,
 * parameterized by event name (see its own doc comment for why "Guess Who's Next"'s call
 * passes both its current AND its pre-rename legacy event names).
 */

import { getDb } from "../../../../db/client";
import { getCurrentEnvironment } from "../../../../utils/environment";
import { adminRoute } from "../../../../utils/account/adminGuard";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";
import { EMPTY_STATS, loadAdminStats } from "../../../../utils/admin/adminStats";
import { parseTimeRange } from "../../../../utils/admin/statsHelpers";

const LIMIT = {
  name: "admin-stats",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

/**
 * Next.js API route handler returning aggregate character-creation and guessing-game
 * usage stats for the signed-in admin. Every query is scoped to the current
 * deployment's environment (see getCurrentEnvironment) so production stats never mix
 * with local/preview noise.
 *
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Aggregate character-creation and guessing-game usage stats (admin-only)
 *     description: >
 *       401 if not signed in, 403 if signed in but not an admin (see ADMIN_EMAILS).
 *       Never reachable from a Vercel Preview deployment's sign-in stub, regardless of
 *       email — see src/utils/account/isAdmin.ts.
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: window
 *         required: false
 *         schema:
 *           type: string
 *           enum: [all, today, 7d, 30d, 90d]
 *         description: Preset time window to filter stats by
 *       - in: query
 *         name: from
 *         required: false
 *         schema:
 *           type: string
 *         description: ISO date string or YYYY-MM-DD for custom start range
 *       - in: query
 *         name: to
 *         required: false
 *         schema:
 *           type: string
 *         description: ISO date string or YYYY-MM-DD for custom end range
 *     responses:
 *       200:
 *         description: Aggregate stats
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to load stats
 */
export const GET = adminRoute(
  LIMIT,
  {
    event: "admin_stats_forbidden",
    message: "Non-admin user denied access to admin stats",
  },
  async (req) => {
    const { range, preset } = parseTimeRange(Object.fromEntries(req.nextUrl.searchParams));
    const environment = getCurrentEnvironment();

    if (!process.env.DATABASE_URL) {
      return Response.json({
        ...EMPTY_STATS,
        environment,
        generatedAt: new Date().toISOString(),
        timeWindow: {
          from: range?.from ? range.from.toISOString() : null,
          to: range?.to ? range.to.toISOString() : null,
          preset,
        },
      });
    }

    try {
      return Response.json(await loadAdminStats(getDb(), environment, range, preset));
    } catch (err) {
      logEvent(
        "error",
        "admin_stats_load_failed",
        "Failed to load admin stats",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      return Response.json({ error: "Failed to load stats" }, { status: 500 });
    }
  },
);
