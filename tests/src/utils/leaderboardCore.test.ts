import { mergeAndRankLeaderboard } from "../../../src/utils/game/leaderboardCore";

const d = (day: number) => new Date(Date.UTC(2026, 0, day));

describe("mergeAndRankLeaderboard", () => {
  it("ranks by streak desc, then earliest date, then id, tagging each row's kind", () => {
    const ranked = mergeAndRankLeaderboard(
      [
        { id: "b", streak: 5, date: d(2) },
        { id: "a", streak: 5, date: d(2) },
        { id: "c", streak: 9, date: d(3) },
      ],
      [
        { id: "g", streak: 5, date: d(1) },
        { id: "h", streak: 1, date: d(1) },
      ],
    );

    expect(ranked.map((r) => [r.id, r.kind])).toEqual([
      ["c", "user"],
      ["g", "guest"],
      ["a", "user"],
      ["b", "user"],
      ["h", "guest"],
    ]);
  });

  it("caps the merged list at ten", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, streak: i, date: d(1) }));
    expect(mergeAndRankLeaderboard(rows, rows)).toHaveLength(10);
  });
});
