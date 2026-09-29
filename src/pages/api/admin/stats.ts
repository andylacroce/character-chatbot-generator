/**
 * Internal, admin-only aggregate stats over analytics_events (and bots/messages counts),
 * backing the /admin page. Not linked from any nav — see src/utils/isAdmin.ts for the
 * access-control story (fails closed with no ADMIN_EMAILS configured, and refuses admin
 * status entirely on a Vercel Preview deployment, whose sign-in stub issues a session for
 * any typed-in email with no verification at all).
 *
 * Every derived rate (creation rate, fallback rate, guest share, etc.) is computed here
 * rather than left for the client to infer from raw counts — the raw `analytics_events`
 * rows on their own (boolean strings in jsonb metadata, several unrelated event types
 * sharing one table) are ambiguous without knowing their recording call sites.
 *
 * Both guessing games' stats sections are built by the same `aggregateGameStats` helper,
 * parameterized by event name (see its own doc comment for why "Guess Who's Next"'s call
 * passes both its current AND its pre-rename legacy event names).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { getDb } from "../../../db/client";
import { analyticsEvents, bots, messages } from "../../../db/schema";
import { getCurrentEnvironment } from "../../../utils/environment";
import { requireAdmin } from "../../../utils/adminGuard";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";

/** Rate limiter: 20 requests per minute per IP, same budget as other authenticated routes. */
const adminStatsRateLimit = createRateLimiter({
  name: "admin-stats",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Event names a game's four lifecycle categories are recorded under. "Guess Who's
 * Next" lists BOTH its current (`guess_who_next_*`) and pre-rename legacy (`game_*`)
 * names in each category — the rename (2026-09-28) only changed what NEW writes use;
 * historical rows keep their old names permanently in this append-only log, so a query
 * that only matched the new names would silently undercount everything written before
 * the rename. "Guess Who" (the new clue-reveal game) has no legacy names — it never had
 * an old one — and has no "continued" category of its own (see below).
 */
interface GameEventNames {
  started: string[];
  correct: string[];
  wrong: string[];
  /** null for a game with no separate "continue" step distinct from a correct guess. */
  continued: string[] | null;
  ended: string[];
}

const GUESS_WHO_NEXT_EVENT_NAMES: GameEventNames = {
  started: ["guess_who_next_started", "game_started"],
  correct: ["guess_who_next_guess_correct", "game_guess_correct"],
  wrong: ["guess_who_next_guess_wrong", "game_guess_wrong"],
  continued: ["guess_who_next_round_continued", "game_round_continued"],
  ended: ["guess_who_next_run_ended", "game_run_ended"],
};

const GUESS_WHO_EVENT_NAMES: GameEventNames = {
  started: ["guess_who_started"],
  correct: ["guess_who_guess_correct"],
  wrong: ["guess_who_guess_wrong"],
  continued: null,
  ended: ["guess_who_run_ended"],
};

/** Rounds a ratio to a percentage with one decimal place, or null when the denominator is 0. */
function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

interface DailyActivityRow {
  day: string;
  validated: number;
  created: number;
  avatarGenerated: number;
}

interface GameDailyRow {
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
  zero: number;
  one: number;
  twoToFour: number;
  fiveOrMore: number;
}

const EMPTY_GAME_STATS = {
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
  finalStreaks: { zero: 0, one: 0, twoToFour: 0, fiveOrMore: 0 },
  daily: [] as GameDailyRow[],
};

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
  game: EMPTY_GAME_STATS,
  guessWhoNext: EMPTY_GAME_STATS,
  guessWho: EMPTY_GAME_STATS,
};

/**
 * Aggregates one game's lifecycle stats from `analytics_events`, given the event names
 * its four lifecycle categories are recorded under (see GameEventNames above). Shared by
 * both guessing games so a change to this aggregation logic (a new derived metric, a
 * bug fix) applies to both at once instead of drifting between two copy-pasted blocks —
 * extracted from a single "Guess Who's Next"-only block that predates the second game.
 */
async function aggregateGameStats(
  db: NeonHttpDatabase<typeof import("../../../db/schema")>,
  envFilter: ReturnType<typeof eq>,
  names: GameEventNames,
) {
  const allNames = [
    ...names.started,
    ...names.correct,
    ...names.wrong,
    ...(names.continued ?? []),
    ...names.ended,
  ];
  const inList = (list: string[]) => inArray(analyticsEvents.name, list);

  const [gameDaily, gameAggregateRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${analyticsEvents.createdAt}, 'YYYY-MM-DD')`,
        started: sql<number>`count(*) filter (where ${inList(names.started)})::int`,
        correct: sql<number>`count(*) filter (where ${inList(names.correct)})::int`,
        ended: sql<number>`count(*) filter (where ${inList(names.ended)})::int`,
      })
      .from(analyticsEvents)
      .where(
        and(
          envFilter,
          inArray(analyticsEvents.name, allNames),
          gte(analyticsEvents.createdAt, new Date(Date.now() - NINETY_DAYS_MS)),
        ),
      )
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
        zero: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int = 0)::int`,
        one: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int = 1)::int`,
        twoToFour: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int between 2 and 4)::int`,
        fiveOrMore: sql<number>`count(*) filter (where ${inList(names.ended)} and (metadata->>'finalStreak')::int >= 5)::int`,
      })
      .from(analyticsEvents)
      .where(and(envFilter, inArray(analyticsEvents.name, allNames))) as Promise<
      GameAggregateRow[]
    >,
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const sevenDaysAgoStr = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
    finalStreaks: {
      zero: agg.zero,
      one: agg.one,
      twoToFour: agg.twoToFour,
      fiveOrMore: agg.fiveOrMore,
    },
    daily: gameDaily,
  };
}

/**
 * Next.js API route handler returning aggregate character-creation and guessing-game
 * usage stats for the signed-in admin. Every query is scoped to the current
 * deployment's environment (see getCurrentEnvironment) so production stats never mix
 * with local/preview noise.
 *
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Aggregate character-creation and guessing-game usage stats (admin-only)
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
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(adminStatsRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const userId = await requireAdmin(req, res, {
    event: "admin_stats_forbidden",
    message: "Non-admin user denied access to admin stats",
  });
  if (!userId) return;
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
      guessWhoNext,
      guessWho,
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
      aggregateGameStats(db, envFilter, GUESS_WHO_NEXT_EVENT_NAMES),
      aggregateGameStats(db, envFilter, GUESS_WHO_EVENT_NAMES),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const sevenDaysAgoStr = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
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
      // "game" kept as an alias of guessWhoNext for one release so any not-yet-updated
      // client of this response shape (there is none in this app today) doesn't break.
      game: guessWhoNext,
      guessWhoNext,
      guessWho,
    });
  } catch (err) {
    logEvent(
      "error",
      "admin_stats_load_failed",
      "Failed to load admin stats",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to load stats" });
  }
}

export default withRequestLog(handler);
