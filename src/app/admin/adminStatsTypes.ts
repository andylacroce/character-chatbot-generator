import type { DailyActivityRow } from "../components/admin/AdminActivityChart";
import type { GameDailyActivityRow } from "../components/admin/GameActivityChart";

export interface GameStats {
  starts: number;
  startedToday: number;
  startedLast7Days: number;
  guestStarts: number;
  guestPct: number | null;
  correctGuesses: number;
  wrongGuesses: number;
  guessAccuracyPct: number | null;
  continuedRounds: number;
  continuationPct: number | null;
  endedByWrongGuess: number;
  endedByGiveUp: number;
  avgFinalStreak: number | null;
  bestStreak: number;
  avgTurnsToSolve: number | null;
  finalStreaks: { zero: number; one: number; twoToFour: number; fiveOrMore: number };
  daily: GameDailyActivityRow[];
}

export interface TimeWindowInfo {
  from: string | null;
  to: string | null;
  preset: string;
}

export const TIME_WINDOW_PRESETS = [
  { label: "All time", preset: "all" },
  { label: "Today", preset: "today" },
  { label: "Last 7 days", preset: "7d" },
  { label: "Last 30 days", preset: "30d" },
  { label: "Last 90 days", preset: "90d" },
  { label: "Custom", preset: "custom" },
] as const;

export type TimeWindowPreset = (typeof TIME_WINDOW_PRESETS)[number]["preset"];

export interface AdminStats {
  environment: string;
  generatedAt: string;
  timeWindow: TimeWindowInfo;
  totals: { bots: number; messages: number; avgMessagesPerBot: number };
  activity: { createdToday: number; createdLast7Days: number; daily: DailyActivityRow[] };
  funnel: { validated: number; blocked: number; created: number; creationRatePct: number | null };
  validation: {
    byWarningLevel: { warningLevel: string; total: number }[];
    unrecognizedCount: number;
    unrecognizedPct: number | null;
  };
  creators: { guestCount: number; signedInCount: number; guestPct: number | null };
  avatars: {
    byProvider: { provider: string; total: number; pct: number }[];
    fallbackRatePct: number | null;
  };
  catalog: {
    totalCached: number;
    byCategory: { category: string; total: number; pct: number }[];
  };
  game: GameStats;
  guessWhoNext: GameStats;
  guessWho: GameStats;
}

export const WARNING_LEVEL_LABELS: Record<string, string> = {
  none: "No concern",
  caution: "Caution (possible trademark)",
  warning: "Warning (clear violation)",
  unknown: "Unknown",
};

export const PROVIDER_LABELS: Record<string, string> = {
  cache: "Reused from cache",
  cloudflare: "Cloudflare Workers AI",
  pollinations: "Pollinations.ai",
  none: "None — silhouette fallback",
  unknown: "Unknown",
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Plain-language description of the window the figures cover, for section hints. */
export function describeWindow(w: TimeWindowInfo): string {
  if (w.preset === "today") return "today (UTC)";
  if (w.preset === "7d" || w.preset === "30d" || w.preset === "90d") {
    return `the last ${w.preset.slice(0, -1)} days`;
  }
  if (w.preset === "custom") {
    if (w.from && w.to) return `${shortDate(w.from)} to ${shortDate(w.to)} (UTC)`;
    if (w.from) return `since ${shortDate(w.from)} (UTC)`;
    if (w.to) return `through ${shortDate(w.to)} (UTC)`;
  }
  return "all recorded activity";
}

/** Renders a percentage, or an em dash when there's no denominator to compute one from. */
export function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/** Percentage of `count` within `total`, rounded to one decimal, or null when total is 0. */
export function pct(count: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((count / total) * 1000) / 10;
}
