/**
 * Internal, admin-only aggregate stats over analytics_events (and bots/messages counts),
 * backing the /admin page. Not linked from any nav — see src/utils/isAdmin.ts for the
 * access-control story (fails closed with no ADMIN_EMAILS configured, and refuses admin
 * status entirely on a Vercel Preview deployment, whose sign-in stub issues a session for
 * any typed-in email with no verification at all).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../src/db/client";
import { analyticsEvents, bots, messages } from "../../../src/db/schema";
import { getCurrentEnvironment } from "../../../src/utils/environment";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { isAdmin } from "../../../src/utils/isAdmin";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import logger from "../../../src/utils/logger";

/** Rate limiter: 20 requests per minute per IP, same budget as other authenticated routes. */
const adminStatsRateLimit = createRateLimiter({
  name: "admin-stats",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Next.js API route handler returning aggregate product-usage stats for the signed-in
 * admin. Every query is scoped to the current deployment's environment (see
 * getCurrentEnvironment) so production stats never mix with local/preview noise.
 *
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Aggregate internal usage stats (admin-only)
 *     description: >
 *       401 if not signed in, 403 if signed in but not an admin (see ADMIN_EMAILS).
 *       Never reachable from a Vercel Preview deployment's sign-in stub, regardless of
 *       email — see src/utils/isAdmin.ts.
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Aggregate stats
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to load stats
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(adminStatsRateLimit, req, res))) return;

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
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(200).json({
      eventCounts: [],
      dailyCounts: [],
      avatarProviders: [],
      validationOutcomes: [],
      botCreators: [],
      totals: { bots: 0, messages: 0 },
    });
    return;
  }

  const db = getDb();
  const environment = getCurrentEnvironment();
  const envFilter = eq(analyticsEvents.environment, environment);

  try {
    const [eventCounts, dailyCounts, avatarProviders, validationOutcomes, botCreators, totals] =
      await Promise.all([
        db
          .select({ name: analyticsEvents.name, total: count() })
          .from(analyticsEvents)
          .where(envFilter)
          .groupBy(analyticsEvents.name),
        db
          .select({
            day: sql<string>`to_char(${analyticsEvents.createdAt}, 'YYYY-MM-DD')`,
            total: count(),
          })
          .from(analyticsEvents)
          .where(
            and(envFilter, gte(analyticsEvents.createdAt, new Date(Date.now() - THIRTY_DAYS_MS))),
          )
          .groupBy(sql`1`)
          .orderBy(sql`1`),
        db
          .select({ provider: sql<string>`metadata->>'provider'`, total: count() })
          .from(analyticsEvents)
          .where(and(envFilter, eq(analyticsEvents.name, "avatar_generated")))
          .groupBy(sql`1`),
        db
          .select({ warningLevel: sql<string>`metadata->>'warningLevel'`, total: count() })
          .from(analyticsEvents)
          .where(and(envFilter, eq(analyticsEvents.name, "character_validated")))
          .groupBy(sql`1`),
        db
          .select({ guest: sql<string>`metadata->>'guest'`, total: count() })
          .from(analyticsEvents)
          .where(and(envFilter, eq(analyticsEvents.name, "bot_created")))
          .groupBy(sql`1`),
        Promise.all([
          db
            .select({ total: count() })
            .from(bots)
            .where(eq(bots.environment, environment))
            .then((rows: { total: number }[]) => rows[0]?.total ?? 0),
          db
            .select({ total: count() })
            .from(messages)
            .innerJoin(bots, eq(messages.botId, bots.id))
            .where(eq(bots.environment, environment))
            .then((rows: { total: number }[]) => rows[0]?.total ?? 0),
        ]).then(([botsTotal, messagesTotal]) => ({ bots: botsTotal, messages: messagesTotal })),
      ]);

    res.status(200).json({
      eventCounts,
      dailyCounts,
      avatarProviders,
      validationOutcomes,
      botCreators,
      totals,
    });
  } catch (err) {
    logger.error("Failed to load admin stats:", { error: err });
    res.status(500).json({ error: "Failed to load stats" });
  }
}
