const mockLogEvent = jest.fn();
jest.mock("../../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

jest.mock("../../../../src/utils/environment", () => ({ getCurrentEnvironment: () => "test" }));

const mockSelect = jest.fn();
const mockOnConflictDoUpdate = jest.fn();
const mockValues = jest.fn();
const mockInsert = jest.fn();
const mockDb = {
  select: (...args: unknown[]) => mockSelect(...args),
  insert: (...args: unknown[]) => mockInsert(...args),
};
jest.mock("../../../../src/db/client", () => ({ getDb: () => mockDb }));

import {
  getGuestHighScore,
  getHighScore,
  getLeaderboard,
  isTopTenPlayer,
  recordGameResult,
  updateHighScoreIfBeaten,
} from "../../../../src/utils/game/scores";
import { getServerGame } from "../../../../src/utils/game/definitions";

/** Makes a thenable Drizzle-like query returning the supplied rows, recording the table it reads. */
function query(rows: unknown[], onFrom?: (table: unknown) => void) {
  const q = {
    from: (table: unknown) => {
      onFrom?.(table);
      return q;
    },
    where: () => q,
    orderBy: () => q,
    groupBy: () => q,
    limit: async () => rows,
    then: (resolve: (value: unknown[]) => void) => Promise.resolve(rows).then(resolve),
  };
  return q;
}

describe.each(["guess-who", "guess-who-next"])("game scores (%s)", (slug) => {
  const game = getServerGame(slug)!;
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://test" };
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("getHighScore", () => {
    it("reads from this game's own high-score table", async () => {
      const tables: unknown[] = [];
      mockSelect.mockReturnValueOnce(query([{ highScore: 4 }], (t) => tables.push(t)));
      expect(await getHighScore(game, "user-1")).toBe(4);
      expect(tables).toEqual([game.tables.highScores]);
    });

    it("returns null when no row exists yet", async () => {
      mockSelect.mockReturnValueOnce(query([]));
      expect(await getHighScore(game, "user-1")).toBeNull();
    });

    it("returns null without a database, never querying", async () => {
      delete process.env.DATABASE_URL;
      expect(await getHighScore(game, "user-1")).toBeNull();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns null and logs under the game's event prefix when the query fails", async () => {
      mockSelect.mockImplementationOnce(() => {
        throw new Error("db down");
      });
      expect(await getHighScore(game, "user-1")).toBeNull();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        `${game.eventPrefix}_high_score_get_failed`,
        expect.any(String),
        expect.anything(),
      );
    });
  });

  describe("updateHighScoreIfBeaten", () => {
    it("no-ops without a database or for a non-positive streak", async () => {
      await updateHighScoreIfBeaten(game, "user-1", 0);
      delete process.env.DATABASE_URL;
      await updateHighScoreIfBeaten(game, "user-1", 3);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("upserts into this game's table, guarded against overwriting a higher score", async () => {
      await updateHighScoreIfBeaten(game, "user-1", 5);
      expect(mockInsert).toHaveBeenCalledWith(game.tables.highScores);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", highScore: 5 }),
      );
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({ highScore: 5 }),
          setWhere: expect.anything(),
        }),
      );
    });

    it("logs without throwing when the upsert fails", async () => {
      mockOnConflictDoUpdate.mockRejectedValueOnce(new Error("db down"));
      await expect(updateHighScoreIfBeaten(game, "user-1", 5)).resolves.toBeUndefined();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        `${game.eventPrefix}_high_score_update_failed`,
        expect.any(String),
        expect.anything(),
      );
    });
  });

  describe("leaderboard", () => {
    it("ranks account and guest scores together, publishing only opted-in names", async () => {
      mockSelect
        .mockReturnValueOnce(query([{ id: "user-1", streak: 3, date: new Date("2026-09-01") }]))
        .mockReturnValueOnce(
          query([
            { id: "guest-1", streak: 5, date: new Date("2026-09-02") },
            { id: "guest-2", streak: 4, date: new Date("2026-09-03") },
          ]),
        )
        .mockReturnValueOnce(query([{ id: "user-1", name: "Ada" }]))
        .mockReturnValueOnce(query([{ id: "guest-1", name: "Guest Ace" }]));

      expect(await getLeaderboard(game)).toEqual([
        { rank: 1, name: "Guest Ace", streak: 5 },
        { rank: 3, name: "Ada", streak: 3 },
      ]);
    });

    it("reads guest names from this game's own guest-profile table", async () => {
      const tables: unknown[] = [];
      mockSelect
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([{ id: "guest-1", streak: 5, date: new Date("2026-09-02") }]))
        .mockReturnValueOnce(query([{ id: "guest-1", name: "Guest Ace" }], (t) => tables.push(t)));
      await getLeaderboard(game);
      expect(tables).toEqual([game.tables.guestProfiles]);
    });

    it("lets a guest claim only when its private score is in the overall top ten", async () => {
      mockSelect
        .mockReturnValueOnce(query([{ id: "user-1", streak: 3, date: new Date("2026-09-01") }]))
        .mockReturnValueOnce(query([{ id: "guest-1", streak: 5, date: new Date("2026-09-02") }]));
      expect(await isTopTenPlayer(game, { guestId: "guest-1" })).toBe(true);
    });
  });

  describe("getGuestHighScore", () => {
    it("returns a guest's best recorded streak, or null when it has none", async () => {
      mockSelect.mockReturnValueOnce(query([{ streak: 7 }]));
      expect(await getGuestHighScore(game, "guest-1")).toBe(7);
      mockSelect.mockReturnValueOnce(query([{ streak: null }]));
      expect(await getGuestHighScore(game, "guest-1")).toBeNull();
    });

    it("returns null without a database, never querying", async () => {
      process.env.DATABASE_URL = "";
      expect(await getGuestHighScore(game, "guest-1")).toBeNull();
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });

  describe("recordGameResult", () => {
    it("upserts a signed-in user's run into this game's results table", async () => {
      await recordGameResult(game, "user-1", null, "run-1", 5);
      expect(mockInsert).toHaveBeenCalledWith(game.tables.results);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "run-1",
          userId: "user-1",
          guestId: null,
          environment: "test",
          bestStreak: 5,
        }),
      );
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ set: expect.objectContaining({ bestStreak: 5 }) }),
      );
    });

    it("upserts a guest's run the same way", async () => {
      await recordGameResult(game, null, "guest-1", "run-2", 3);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, guestId: "guest-1", bestStreak: 3 }),
      );
    });

    it("does nothing without a database, for a non-positive streak, or without exactly one owner", async () => {
      await recordGameResult(game, "user-1", null, "run-1", 0);
      await recordGameResult(game, "user-1", "guest-1", "run-1", 5);
      await recordGameResult(game, null, null, "run-1", 5);
      process.env.DATABASE_URL = "";
      await recordGameResult(game, "user-1", null, "run-1", 5);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("logs and swallows a database error rather than throwing", async () => {
      mockOnConflictDoUpdate.mockRejectedValue(new Error("db down"));
      await expect(recordGameResult(game, "user-1", null, "run-1", 5)).resolves.toBeUndefined();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        `${game.eventPrefix}_result_update_failed`,
        "Failed to save game result",
        expect.objectContaining({ error: "db down" }),
      );
    });
  });
});
