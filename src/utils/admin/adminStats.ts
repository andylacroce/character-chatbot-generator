import { eq } from "drizzle-orm";
import { analyticsEvents } from "../../db/schema";
import { aggregateCharacterStats, type DailyActivityRow } from "./characterStats";
import {
  EMPTY_GAME_STATS,
  GUESS_WHO_EVENT_NAMES,
  GUESS_WHO_NEXT_EVENT_NAMES,
  aggregateGameStats,
} from "./gameStats";
import type { StatsDb, TimeRangeFilter } from "./statsHelpers";

/** The response shape with every figure zeroed, served when there is no database. */
export const EMPTY_STATS = {
  environment: "unknown",
  generatedAt: new Date(0).toISOString(),
  timeWindow: { from: null, to: null, preset: "all" },
  totals: {
    bots: 0,
    messages: 0,
    avgMessagesPerBot: 0,
  },
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
  catalog: {
    totalCached: 0,
    byCategory: [] as { category: string; total: number; pct: number }[],
  },
  game: EMPTY_GAME_STATS,
  guessWhoNext: EMPTY_GAME_STATS,
  guessWho: EMPTY_GAME_STATS,
};

/**
 * Builds the full `/api/admin/stats` response for one environment: character-creation
 * stats plus both guessing games, optionally scoped by a time-window filter. All queries run concurrently.
 */
export async function loadAdminStats(
  db: StatsDb,
  environment: string,
  timeRange?: TimeRangeFilter,
  preset?: string,
) {
  const envFilter = eq(analyticsEvents.environment, environment);
  const [character, guessWhoNext, guessWho] = await Promise.all([
    aggregateCharacterStats(db, envFilter, environment, timeRange),
    aggregateGameStats(db, envFilter, GUESS_WHO_NEXT_EVENT_NAMES, timeRange),
    aggregateGameStats(db, envFilter, GUESS_WHO_EVENT_NAMES, timeRange),
  ]);

  return {
    environment,
    generatedAt: new Date().toISOString(),
    timeWindow: {
      from: timeRange?.from ? timeRange.from.toISOString() : null,
      to: timeRange?.to ? timeRange.to.toISOString() : null,
      preset: preset ?? "all",
    },
    ...character,
    // "game" kept as an alias of guessWhoNext for one release so any not-yet-updated
    // client of this response shape (there is none in this app today) doesn't break.
    game: guessWhoNext,
    guessWhoNext,
    guessWho,
  };
}
