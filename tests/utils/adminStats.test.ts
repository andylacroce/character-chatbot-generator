import { EMPTY_STATS, loadAdminStats } from "../../src/utils/admin/adminStats";
import { makeStatsDb } from "../helpers/fakeStatsDb";

describe("loadAdminStats", () => {
  it("combines character stats with both games and aliases `game` to Guess Who's Next", async () => {
    // 8 character selects, then Guess Who's Next (2), then Guess Who (2).
    const db = makeStatsDb([[], [], [], [], [], [], [], [], [], [], [], []]);
    const stats = await loadAdminStats(db, "test-env");
    expect(stats.environment).toBe("test-env");
    expect(new Date(stats.generatedAt).getTime()).not.toBeNaN();
    expect(stats.game).toBe(stats.guessWhoNext);
    expect(stats.guessWho.starts).toBe(0);
    expect(Object.keys(stats)).toEqual(
      expect.arrayContaining([
        "totals",
        "activity",
        "funnel",
        "validation",
        "creators",
        "avatars",
        "catalog",
      ]),
    );
    expect(db.select).toHaveBeenCalledTimes(12);
  });

  it("reads each game's rows from its own selects, in order", async () => {
    const aggregate = { starts: 7 };
    const db = makeStatsDb([[], [], [], [], [], [], [], [], [], [aggregate], [], [{ starts: 2 }]]);
    const stats = await loadAdminStats(db, "test-env");
    expect(stats.guessWhoNext.starts).toBe(7);
    expect(stats.guessWho.starts).toBe(2);
  });
});

describe("EMPTY_STATS", () => {
  it("has the same top-level keys as a real response", async () => {
    const real = await loadAdminStats(makeStatsDb([]), "test-env");
    expect(Object.keys(EMPTY_STATS).sort()).toEqual(Object.keys(real).sort());
  });
});
