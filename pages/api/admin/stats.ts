/**
 * Internal, admin-only aggregate stats over analytics_events (and bots/messages counts),
 * backing the /admin page. Not linked from any nav — see src/utils/isAdmin.ts for the
 * access-control story (fails closed with no ADMIN_EMAILS configured, and refuses admin
 * status entirely on a Vercel Preview deployment, whose sign-in stub issues a session for
 * any typed-in email with no verification at all).
 *
 * Every derived rate (creation rate, fallback rate, guest share, etc.) is computed here
 * rather than left for the client to infer from raw counts — the raw `analytics_events`
 * rows on their own (boolean strings in jsonb metadata, three unrelated event types sharing
 * one table) are genuinely ambiguous without knowing the recording call sites in
 * validate-character.ts/generate-personality.ts/generate-avatar.ts.
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

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Rounds a ratio to a percentage with one decimal place, or null when the denominator is 0. */
function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

const EMPTY_STATS = {
  environment: "unknown",
  generatedAt: new Date(0).toISOString(),
  totals: { bots: 0, messages: 0, avgMessagesPerBot: 0 },
  activity: { createdToday: 0, createdLast7Days: 0, daily: [] as DailyActivityRow[] },
  funnel: { validated: 0, blocked: 0, created: 0, creationRatePct: null as number | null },
  validation: {
    byWarningLevel: [] as { warningLevel: string; total: number }[],
    unrecognizedCount: 0,
    unrecognizedPct: null as number | null,
  },
  creators: { guestCount: 0, signedInCount: 0, guestPct: null as number | null },
  avatars: {
    byProvider: [] as { provider: string; total: number; pct: number }[],
    fallbackRatePct: null as number | null,
  },
};

interface DailyActivityRow {
  day: string;
  validated: number;
  created: number;
  avatarGenerated: number;
}

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
      ...EMPTY_STATS,
      environment: getCurrentEnvironment(),
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  const db = getDb();
  const environment = getCurrentEnvironment();
  const envFilter = eq(analyticsEvents.environment, environment);

  try {
    const [
      dailyActivity,
      validationAgg,
      validationByLevel,
      creatorAgg,
      avatarByProvider,
      totalsRaw,
    ] = await Promise.all([
      db
        .select({
          day: sql<string>`to_char(${analyticsEvents.createdAt}, 'YYYY-MM-DD')`,
          validated: sql<number>`count(*) filter (where ${analyticsEvents.name} = 'character_validated')::int`,
          created: sql<number>`count(*) filter (where ${analyticsEvents.name} = 'bot_created')::int`,
          avatarGenerated: sql<number>`count(*) filter (where ${analyticsEvents.name} = 'avatar_generated')::int`,
        })
        .from(analyticsEvents)
        .where(
          and(envFilter, gte(analyticsEvents.createdAt, new Date(Date.now() - NINETY_DAYS_MS))),
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`) as Promise<DailyActivityRow[]>,
      db
        .select({
          total: count(),
          blocked: sql<number>`count(*) filter (where metadata->>'blocked' = 'true')::int`,
          unrecognized: sql<number>`count(*) filter (where metadata->>'recognized' = 'false')::int`,
        })
        .from(analyticsEvents)
        .where(and(envFilter, eq(analyticsEvents.name, "character_validated")))
        .then(
          (rows: { total: number; blocked: number; unrecognized: number }[]) =>
            rows[0] ?? {
              total: 0,
              blocked: 0,
              unrecognized: 0,
            },
        ),
      db
        .select({
          warningLevel: sql<string>`coalesce(metadata->>'warningLevel', 'unknown')`,
          total: count(),
        })
        .from(analyticsEvents)
        .where(and(envFilter, eq(analyticsEvents.name, "character_validated")))
        .groupBy(sql`1`),
      db
        .select({
          total: count(),
          guest: sql<number>`count(*) filter (where metadata->>'guest' = 'true')::int`,
          signedIn: sql<number>`count(*) filter (where metadata->>'guest' = 'false')::int`,
        })
        .from(analyticsEvents)
        .where(and(envFilter, eq(analyticsEvents.name, "bot_created")))
        .then(
          (rows: { total: number; guest: number; signedIn: number }[]) =>
            rows[0] ?? {
              total: 0,
              guest: 0,
              signedIn: 0,
            },
        ),
      db
        .select({
          provider: sql<string>`coalesce(metadata->>'provider', 'unknown')`,
          total: count(),
        })
        .from(analyticsEvents)
        .where(and(envFilter, eq(analyticsEvents.name, "avatar_generated")))
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

    const todayStr = new Date().toISOString().slice(0, 10);
    const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const createdToday = dailyActivity.find((row) => row.day === todayStr)?.created ?? 0;
    const createdLast7Days = dailyActivity
      .filter((row) => row.day >= sevenDaysAgoStr)
      .reduce((sum, row) => sum + row.created, 0);

    const avatarTotal = avatarByProvider.reduce(
      (sum: number, row: { total: number }) => sum + row.total,
      0,
    );
    const avatarNone =
      avatarByProvider.find((row: { provider: string }) => row.provider === "none")?.total ?? 0;

    res.status(200).json({
      environment,
      generatedAt: new Date().toISOString(),
      totals: {
        bots: totalsRaw.bots,
        messages: totalsRaw.messages,
        avgMessagesPerBot:
          totalsRaw.bots > 0 ? Math.round((totalsRaw.messages / totalsRaw.bots) * 10) / 10 : 0,
      },
      activity: {
        createdToday,
        createdLast7Days,
        daily: dailyActivity,
      },
      funnel: {
        validated: validationAgg.total,
        blocked: validationAgg.blocked,
        created: creatorAgg.total,
        creationRatePct: pct(creatorAgg.total, validationAgg.total),
      },
      validation: {
        byWarningLevel: validationByLevel,
        unrecognizedCount: validationAgg.unrecognized,
        unrecognizedPct: pct(validationAgg.unrecognized, validationAgg.total),
      },
      creators: {
        guestCount: creatorAgg.guest,
        signedInCount: creatorAgg.signedIn,
        guestPct: pct(creatorAgg.guest, creatorAgg.total),
      },
      avatars: {
        byProvider: avatarByProvider.map((row: { provider: string; total: number }) => ({
          provider: row.provider,
          total: row.total,
          pct: pct(row.total, avatarTotal) ?? 0,
        })),
        fallbackRatePct: pct(avatarNone, avatarTotal),
      },
    });
  } catch (err) {
    logger.error("Failed to load admin stats:", { error: err });
    res.status(500).json({ error: "Failed to load stats" });
  }
}
