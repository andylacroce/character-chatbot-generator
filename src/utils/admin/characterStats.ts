import { and, count, eq, gte, sql } from "drizzle-orm";
import { analyticsEvents, bots, messages } from "../../db/schema";
import { NINETY_DAYS_MS, pct, recentDayBounds, type EnvFilter, type StatsDb } from "./statsHelpers";

/** One day of character-creation activity. */
export interface DailyActivityRow {
  day: string;
  validated: number;
  created: number;
  avatarGenerated: number;
}

/**
 * Aggregates character-creation stats: totals, the validate-to-create funnel, validation
 * outcomes, guest vs signed-in creators, avatar providers, and 90 days of daily activity.
 * Every derived rate is computed here rather than left for the client to infer.
 */
export async function aggregateCharacterStats(
  db: StatsDb,
  envFilter: EnvFilter,
  environment: string,
) {
  const [dailyActivity, validationAgg, validationByLevel, creatorAgg, avatarByProvider, totalsRaw] =
    await Promise.all([
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

  const { today: todayStr, sevenDaysAgo: sevenDaysAgoStr } = recentDayBounds();
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

  return {
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
  };
}
