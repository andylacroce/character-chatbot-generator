import {
  EMPTY_GAME_STATS,
  GUESS_WHO_EVENT_NAMES,
  GUESS_WHO_NEXT_EVENT_NAMES,
  aggregateGameStats,
} from "../../src/utils/admin/gameStats";
import { makeStatsDb } from "../helpers/fakeStatsDb";
import type { EnvFilter } from "../../src/utils/admin/statsHelpers";

const envFilter = {} as EnvFilter;
const today = new Date().toISOString().slice(0, 10);

const AGG = {
  starts: 8,
  guestStarts: 2,
  correct: 6,
  wrong: 4,
  continued: 3,
  endedWrong: 2,
  endedGiveUp: 1,
  finalStreakSum: 5,
  bestStreak: 4,
  turnSum: 15,
  turnCount: 6,
  zero: 1,
  one: 1,
  twoToFour: 1,
  fiveOrMore: 0,
};

describe("event names", () => {
  it("keeps Guess Who's Next's pre-rename names alongside the current ones", () => {
    expect(GUESS_WHO_NEXT_EVENT_NAMES.started).toEqual(["guess_who_next_started", "game_started"]);
  });

  it("gives Guess Who no legacy names and no continue step", () => {
    expect(GUESS_WHO_EVENT_NAMES.started).toEqual(["guess_who_started"]);
    expect(GUESS_WHO_EVENT_NAMES.continued).toBeNull();
  });
});

describe("aggregateGameStats", () => {
  it("derives rates and averages from the aggregate row", async () => {
    const db = makeStatsDb([[{ day: today, started: 3, correct: 2, ended: 1 }], [AGG]]);
    const stats = await aggregateGameStats(db, envFilter, GUESS_WHO_NEXT_EVENT_NAMES);
    expect(stats).toMatchObject({
      starts: 8,
      startedToday: 3,
      startedLast7Days: 3,
      guestPct: 25,
      guessAccuracyPct: 60,
      continuationPct: 50,
      avgFinalStreak: 1.7,
      avgTurnsToSolve: 2.5,
      bestStreak: 4,
      endedByWrongGuess: 2,
      endedByGiveUp: 1,
      finalStreaks: { zero: 1, one: 1, twoToFour: 1, fiveOrMore: 0 },
    });
  });

  it("has no continuation rate for a game without a continue step", async () => {
    const db = makeStatsDb([[], [AGG]]);
    const stats = await aggregateGameStats(db, envFilter, GUESS_WHO_EVENT_NAMES);
    expect(stats.continuationPct).toBeNull();
  });

  it("only counts days inside the trailing week as 'last 7 days'", async () => {
    const db = makeStatsDb([
      [
        { day: today, started: 1, correct: 0, ended: 0 },
        { day: "2000-01-01", started: 9, correct: 0, ended: 0 },
      ],
      [AGG],
    ]);
    const stats = await aggregateGameStats(db, envFilter, GUESS_WHO_NEXT_EVENT_NAMES);
    expect(stats.startedLast7Days).toBe(1);
    expect(stats.daily).toHaveLength(2);
  });

  it("returns zeros and null rates when there is no activity", async () => {
    const stats = await aggregateGameStats(
      makeStatsDb([[], []]),
      envFilter,
      GUESS_WHO_NEXT_EVENT_NAMES,
    );
    expect(stats).toEqual(EMPTY_GAME_STATS);
  });
});
