import type { DailyActivityRow } from "../components/admin/AdminActivityChart";
import type { GameDailyActivityRow } from "../components/admin/GameActivityChart";

export interface AdminStats {
  environment: string;
  generatedAt: string;
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
  game: {
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
  };
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

/** Renders a percentage, or an em dash when there's no denominator to compute one from. */
export function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/** Percentage of `count` within `total`, rounded to one decimal, or null when total is 0. */
export function pct(count: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((count / total) * 1000) / 10;
}
