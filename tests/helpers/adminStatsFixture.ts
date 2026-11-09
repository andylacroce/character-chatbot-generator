import type { AdminStats } from "../../src/app/admin/adminStatsTypes";

/** A fully-populated `/api/admin/stats` response shared by the admin stats tests. */
export const FULL_STATS: AdminStats = {
  environment: "production",
  generatedAt: new Date().toISOString(),
  totals: { bots: 2, messages: 10, avgMessagesPerBot: 5 },
  activity: {
    createdToday: 1,
    createdLast7Days: 3,
    daily: [{ day: "2026-09-10", validated: 4, created: 2, avatarGenerated: 2 }],
  },
  funnel: { validated: 10, blocked: 1, created: 6, creationRatePct: 60 },
  validation: {
    byWarningLevel: [
      { warningLevel: "none", total: 8 },
      { warningLevel: "caution", total: 2 },
    ],
    unrecognizedCount: 3,
    unrecognizedPct: 30,
  },
  creators: { guestCount: 4, signedInCount: 2, guestPct: 66.7 },
  avatars: {
    byProvider: [
      { provider: "cache", total: 3, pct: 50 },
      { provider: "none", total: 1, pct: 16.7 },
    ],
    fallbackRatePct: 16.7,
  },
  game: {
    starts: 8,
    startedToday: 1,
    startedLast7Days: 3,
    guestStarts: 5,
    guestPct: 62.5,
    correctGuesses: 6,
    wrongGuesses: 4,
    guessAccuracyPct: 60,
    continuedRounds: 4,
    continuationPct: 66.7,
    endedByWrongGuess: 2,
    endedByGiveUp: 1,
    avgFinalStreak: 1.7,
    bestStreak: 4,
    avgTurnsToSolve: 2.5,
    finalStreaks: { zero: 1, one: 1, twoToFour: 1, fiveOrMore: 0 },
    daily: [{ day: new Date().toISOString().slice(0, 10), started: 1, correct: 2, ended: 1 }],
  },
};
