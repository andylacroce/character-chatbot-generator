import type { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

/** The Drizzle database handle the stats aggregations run against. */
export type StatsDb = NeonHttpDatabase<typeof import("../../db/schema")>;

/** The `environment = <current>` filter every stats query is scoped by. */
export type EnvFilter = ReturnType<typeof eq>;

/** How far back the daily activity charts reach. */
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Rounds a ratio to a percentage with one decimal place, or null when the denominator is 0. */
export function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Today and the first day of the trailing 7-day window, as `YYYY-MM-DD` strings. */
export function recentDayBounds(): { today: string; sevenDaysAgo: string } {
  return {
    today: new Date().toISOString().slice(0, 10),
    sevenDaysAgo: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}

/** Optional time-window boundaries for scoping stats queries. */
export interface TimeRangeFilter {
  from?: Date;
  to?: Date;
}

/** Parses time-window filter parameters from query arguments. */
export function parseTimeRange(query: {
  window?: string | string[];
  from?: string | string[];
  to?: string | string[];
}): { range?: TimeRangeFilter; preset: string } {
  const windowParam = typeof query.window === "string" ? query.window : undefined;
  const fromParam = typeof query.from === "string" ? query.from : undefined;
  const toParam = typeof query.to === "string" ? query.to : undefined;

  const now = new Date();

  if (fromParam || toParam) {
    const from = fromParam ? new Date(fromParam) : undefined;
    const to = toParam
      ? new Date(toParam.length === 10 ? `${toParam}T23:59:59.999Z` : toParam)
      : undefined;
    const validFrom = from && !isNaN(from.getTime()) ? from : undefined;
    const validTo = to && !isNaN(to.getTime()) ? to : undefined;
    if (validFrom || validTo) {
      return {
        range: { from: validFrom, to: validTo },
        preset: "custom",
      };
    }
  }

  if (windowParam === "today") {
    const startOfToday = new Date(now.toISOString().slice(0, 10));
    return { range: { from: startOfToday, to: now }, preset: "today" };
  }
  if (windowParam === "7d") {
    return {
      range: { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), to: now },
      preset: "7d",
    };
  }
  if (windowParam === "30d") {
    return {
      range: { from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to: now },
      preset: "30d",
    };
  }
  if (windowParam === "90d") {
    return {
      range: { from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), to: now },
      preset: "90d",
    };
  }

  return { preset: "all" };
}
