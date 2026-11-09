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
