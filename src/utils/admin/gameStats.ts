import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { analyticsEvents } from "../../db/schema";
import {
  NINETY_DAYS_MS,
  pct,
  recentDayBounds,
  type EnvFilter,
  type StatsDb,
  type TimeRangeFilter,
} from "./statsHelpers";

/**
 * Event names a game's four lifecycle categories are recorded under. "Guess Who's
 * Next" lists BOTH its current (`guess_who_next_*`) and pre-rename legacy (`game_*`)
 * names in each category — the rename (2026-09-28) only changed what NEW writes use;
 * historical rows keep their old names permanently in this append-only log, so a query
 * that only matched the new names would silently undercount everything written before
 * the rename. "Guess Who" (the new clue-reveal game) has no legacy names — it never had
 * an old one — and has no "continued" category of its own (see below).
 */
export interface GameEventNames {
  started: string[];
  correct: string[];
  wrong: string[];
  /** null for a game with no separate "continue" step distinct from a correct guess. */
  continued: string[] | null;
  ended: string[];
}

export const GUESS_WHO_NEXT_EVENT_NAMES: GameEventNames = {
  started: ["guess_who_next_started", "game_started"],
  correct: ["guess_who_next_guess_correct", "game_guess_correct"],
  wrong: ["guess_who_next_guess_wrong", "game_guess_wrong"],
  continued: ["guess_who_next_round_continued", "game_round_continued"],
  ended: ["guess_who_next_run_ended", "game_run_ended"],
};

export const GUESS_WHO_EVENT_NAMES: GameEventNames = {
  started: ["guess_who_started"],
  correct: ["guess_who_guess_correct"],
  wrong: ["guess_who_guess_wrong"],
  continued: null,
  ended: ["guess_who_run_ended"],
};

export interface GameDailyRow {
  day: string;
  started: number;
  correct: number;
  ended: number;
}

interface GameAggregateRow {
  starts: number;
  guestStarts: number;
  correct: number;
  wrong: number;
  continued: number;
  endedWrong: number;
  endedGiveUp: number;
  finalStreakSum: number;
  bestStreak: number;
  turnSum: number;
  turnCount: number;
  zero: number;
  one: number;
  twoToFour: number;
  fiveOrMore: number;
}

export const EMPTY_GAME_STATS = {
  starts: 0,
  startedToday: 0,
  startedLast7Days: 0,
  guestStarts: 0,
  guestPct: null as number | null,
  correctGuesses: 0,
  wrongGuesses: 0,
  guessAccuracyPct: null as number | null,
  continuedRounds: 0,
  continuationPct: null as number | null,
  endedByWrongGuess: 0,
  endedByGiveUp: 0,
  avgFinalStreak: null as number | null,
  bestStreak: 0,
  avgTurnsToSolve: null as number | null,
  finalStreaks: { zero: 0, one: 0, twoToFour: 0, fiveOrMore: 0 },
  daily: [] as GameDailyRow[],
};

/**
 * Aggregates one game's lifecycle stats from `analytics_events`, given the event names
 * its four lifecycle categories are recorded under (see GameEventNames above). Shared by
 * both guessing games so a change to this aggregation logic (a new derived metric, a
 * bug fix) applies to both at once instead of drifting between two copy-pasted blocks —
 * extracted from a single "Guess Who's Next"-only block that predates the second game.
 */
export async function aggregateGameStats(
  db: StatsDb,
  envFilter: EnvFilter,
  names: GameEventNames,
  timeRange?: TimeRangeFilter,
) {
  const allNames = [
    ...names.started,
    ...names.correct,
    ...names.wrong,
    ...(names.continued ?? []),
    ...names.ended,
  ];
  const inList = (list: string[]) => inArray(analyticsEvents.name, list);

  const dailyFrom = timeRange?.from ?? new Date(Date.now() - NINETY_DAYS_MS);
  const dailyTimeConditions = [gte(analyticsEvents.createdAt, dailyFrom)];
  if (timeRange?.to) dailyTimeConditions.push(lte(analyticsEvents.createdAt, timeRange.to));

  const eventTimeConditions = [];
  if (timeRange?.from) eventTimeConditions.push(gte(analyticsEvents.createdAt, timeRange.from));
  if (timeRange?.to) eventTimeConditions.push(lte(analyticsEvents.createdAt, timeRange.to));

  const [gameDaily, gameAggregateRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${analyticsEvents.createdAt}, 'YYYY-MM-DD')`,
        started: sql<number>`count(*) filter (where ${inList(names.started)})::int`,
        correct: sql<number>`count(*) filter (where ${inList(names.correct)})::int`,
        ended: sql<number>`count(*) filter (where ${inList(names.ended)})::int`,
      })
      .from(analyticsEvents)
      .where(and(envFilter, inArray(analyticsEvents.name, allNames), ...dailyTimeConditions))
      .groupBy(sql`1`)
      .orderBy(sql`1`) as Promise<GameDailyRow[]>,
    db
      .select({
        starts: sql<number>`count(*) filter (where ${inList(names.started)})::int`,
        guestStarts: sql<number>`count(*) filter (where ${inList(names.started)} and metadata->>'guest' = 'true')::int`,
        correct: sql<number>`count(*) filter (where ${inList(names.correct)})::int`,
        wrong: sql<number>`count(*) filter (where ${inList(names.wrong)})::int`,
        continued: names.continued
          ? sql<number>`count(*) filter (where ${inList(names.continued)})::int`
          : sql<number>`0`,
        endedWrong: sql<number>`count(*) filter (where ${inList(names.ended)} and metadata->>'reason' in ('second_wrong', 'out_of_clues'))::int`,
        endedGiveUp: sql<number>`count(*) filter (where ${inList(names.ended)} and metadata->>'reason' = 'give_up')::int`,
        finalStreakSum: sql<number>`coalesce(sum((metadata->>'finalStreak')::int) filter (where ${inList(names.ended)}), 0)::int`,
        bestStreak: sql<number>`coalesce(max((metadata->>'streak')::int) filter (where ${inList(names.correct)}), 0)::int`,
        turnSum: sql<number>`coalesce(sum((metadata->>'turn')::int) filter (where ${inList(names.correct)} and metadata->>'turn' is not null), 0)::int`,
        turnCount: sql<number>`count(*) filter (where ${inList(names.correct)} and metadata->>'turn' is not null)::int`,
        zero: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int = 0)::int`,
        one: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int = 1)::int`,
        twoToFour: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int between 2 and 4)::int`,
        fiveOrMore: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int >= 5)::int`,
      })
      .from(analyticsEvents)
      .where(
        and(envFilter, inArray(analyticsEvents.name, allNames), ...eventTimeConditions),
      ) as Promise<GameAggregateRow[]>,
  ]);

  const { today: todayStr, sevenDaysAgo: sevenDaysAgoStr } = recentDayBounds();
  const agg = gameAggregateRows[0] ?? {
    starts: 0,
    guestStarts: 0,
    correct: 0,
    wrong: 0,
    continued: 0,
    endedWrong: 0,
    endedGiveUp: 0,
    finalStreakSum: 0,
    bestStreak: 0,
    turnSum: 0,
    turnCount: 0,
    zero: 0,
    one: 0,
    twoToFour: 0,
    fiveOrMore: 0,
  };
  const endedRuns = agg.endedWrong + agg.endedGiveUp;

  return {
    starts: agg.starts,
    startedToday: gameDaily.find((row) => row.day === todayStr)?.started ?? 0,
    startedLast7Days: gameDaily
      .filter((row) => row.day >= sevenDaysAgoStr)
      .reduce((sum, row) => sum + row.started, 0),
    guestStarts: agg.guestStarts,
    guestPct: pct(agg.guestStarts, agg.starts),
    correctGuesses: agg.correct,
    wrongGuesses: agg.wrong,
    guessAccuracyPct: pct(agg.correct, agg.correct + agg.wrong),
    continuedRounds: agg.continued,
    continuationPct: names.continued ? pct(agg.continued, agg.correct) : null,
    endedByWrongGuess: agg.endedWrong,
    endedByGiveUp: agg.endedGiveUp,
    avgFinalStreak: endedRuns > 0 ? Math.round((agg.finalStreakSum / endedRuns) * 10) / 10 : null,
    bestStreak: agg.bestStreak,
    avgTurnsToSolve: agg.turnCount > 0 ? Math.round((agg.turnSum / agg.turnCount) * 10) / 10 : null,
    finalStreaks: {
      zero: agg.zero,
      one: agg.one,
      twoToFour: agg.twoToFour,
      fiveOrMore: agg.fiveOrMore,
    },
    daily: gameDaily,
  };
}
