import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { analyticsEvents, avatarCache, bots, messages } from "../../db/schema";
import {
  NINETY_DAYS_MS,
  pct,
  recentDayBounds,
  type EnvFilter,
  type StatsDb,
  type TimeRangeFilter,
} from "./statsHelpers";

/** One day of character-creation activity. */
export interface DailyActivityRow {
  day: string;
  validated: number;
  created: number;
  avatarGenerated: number;
}

/**
 * Aggregates character-creation stats: totals, the validate-to-create funnel, validation
 * outcomes, guest vs signed-in creators, avatar providers, and daily activity.
 * When timeRange is supplied, filters activity, funnel, creators, and totals to that window.
 */
export async function aggregateCharacterStats(
  db: StatsDb,
  envFilter: EnvFilter,
  environment: string,
  timeRange?: TimeRangeFilter,
) {
  const eventTimeConditions = [];
  if (timeRange?.from) eventTimeConditions.push(gte(analyticsEvents.createdAt, timeRange.from));
  if (timeRange?.to) eventTimeConditions.push(lte(analyticsEvents.createdAt, timeRange.to));

  const dailyFrom = timeRange?.from ?? new Date(Date.now() - NINETY_DAYS_MS);
  const dailyTimeConditions = [gte(analyticsEvents.createdAt, dailyFrom)];
  if (timeRange?.to) dailyTimeConditions.push(lte(analyticsEvents.createdAt, timeRange.to));

  const botTimeConditions = [];
  if (timeRange?.from) botTimeConditions.push(gte(bots.createdAt, timeRange.from));
  if (timeRange?.to) botTimeConditions.push(lte(bots.createdAt, timeRange.to));

  const [
    dailyActivity,
    validationAgg,
    validationByLevel,
    creatorAgg,
    avatarByProvider,
    totalsRaw,
    catalogByCategory,
  ] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${analyticsEvents.createdAt}, 'YYYY-MM-DD')`,
        validated: sql<number>`count(*) filter (where ${analyticsEvents.name} = 'character_validated')::int`,
        created: sql<number>`count(*) filter (where ${analyticsEvents.name} = 'bot_created')::int`,
        avatarGenerated: sql<number>`count(*) filter (where ${analyticsEvents.name} = 'avatar_generated')::int`,
      })
      .from(analyticsEvents)
      .where(and(envFilter, ...dailyTimeConditions))
      .groupBy(sql`1`)
      .orderBy(sql`1`) as Promise<DailyActivityRow[]>,
    db
      .select({
        total: count(),
        blocked: sql<number>`count(*) filter (where metadata->>'blocked' = 'true')::int`,
        unrecognized: sql<number>`count(*) filter (where metadata->>'recognized' = 'false')::int`,
      })
      .from(analyticsEvents)
      .where(
        and(envFilter, eq(analyticsEvents.name, "character_validated"), ...eventTimeConditions),
      )
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
      .where(
        and(envFilter, eq(analyticsEvents.name, "character_validated"), ...eventTimeConditions),
      )
      .groupBy(sql`1`),
    db
      .select({
        total: count(),
        guest: sql<number>`count(*) filter (where metadata->>'guest' = 'true')::int`,
        signedIn: sql<number>`count(*) filter (where metadata->>'guest' = 'false')::int`,
      })
      .from(analyticsEvents)
      .where(and(envFilter, eq(analyticsEvents.name, "bot_created"), ...eventTimeConditions))
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
      .where(and(envFilter, eq(analyticsEvents.name, "avatar_generated"), ...eventTimeConditions))
      .groupBy(sql`1`),
    Promise.all([
      db
        .select({ total: count() })
        .from(bots)
        .where(and(eq(bots.environment, environment), ...botTimeConditions))
        .then((rows: { total: number }[]) => rows[0]?.total ?? 0),
      // Messages belong to the characters saved in the window, so the per-character
      // average divides like by like (a message's own date would mix cohorts).
      db
        .select({ total: count() })
        .from(messages)
        .innerJoin(bots, eq(messages.botId, bots.id))
        .where(and(eq(bots.environment, environment), ...botTimeConditions))
        .then((rows: { total: number }[]) => rows[0]?.total ?? 0),
    ]).then(([botsTotal, messagesTotal]) => ({ bots: botsTotal, messages: messagesTotal })),
    db
      .select({
        category: sql<string>`coalesce(${avatarCache.category}, 'other')`,
        total: count(),
      })
      .from(avatarCache)
      .groupBy(sql`1`) as Promise<{ category: string; total: number }[]>,
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

  const catalogTotal = catalogByCategory.reduce(
    (sum: number, row: { total: number }) => sum + row.total,
    0,
  );

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
    catalog: {
      totalCached: catalogTotal,
      byCategory: catalogByCategory.map((row: { category: string; total: number }) => ({
        category: row.category,
        total: row.total,
        pct: pct(row.total, catalogTotal) ?? 0,
      })),
    },
  };
}
