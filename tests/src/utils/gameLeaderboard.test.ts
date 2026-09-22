const mockSelect = jest.fn();
const mockOnConflictDoUpdate = jest.fn();
const mockValues = jest.fn();
const mockInsert = jest.fn();
const mockDb = {
  select: (...args: unknown[]) => mockSelect(...args),
  insert: (...args: unknown[]) => mockInsert(...args),
};
jest.mock("../../../src/db/client", () => ({ getDb: () => mockDb }));
jest.mock("../../../src/utils/environment", () => ({ getCurrentEnvironment: () => "test" }));
const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (meta: unknown) => meta,
}));

import {
  getLeaderboard,
  isTopTenPlayer,
  getGuestHighScore,
  recordGameResult,
} from "../../../src/utils/gameLeaderboard";

/** Makes a thenable Drizzle-like query returning the supplied rows. */
function query(rows: unknown[]) {
  const q = {
    from: () => q,
    where: () => q,
    orderBy: () => q,
    groupBy: () => q,
    limit: async () => rows,
    then: (resolve: (value: unknown[]) => void) => Promise.resolve(rows).then(resolve),
  };
  return q;
}

describe("game leaderboard", () => {
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

    expect(await getLeaderboard()).toEqual([
      { rank: 1, name: "Guest Ace", streak: 5 },
      { rank: 3, name: "Ada", streak: 3 },
    ]);
  });

  it("lets a guest claim only when its private score is in the overall top ten", async () => {
    mockSelect
      .mockReturnValueOnce(query([{ id: "user-1", streak: 3, date: new Date("2026-09-01") }]))
      .mockReturnValueOnce(query([{ id: "guest-1", streak: 5, date: new Date("2026-09-02") }]));
    expect(await isTopTenPlayer({ guestId: "guest-1" })).toBe(true);
  });

  describe("getGuestHighScore", () => {
    it("returns a guest's best recorded streak", async () => {
      mockSelect.mockReturnValueOnce(query([{ streak: 7 }]));
      expect(await getGuestHighScore("guest-1")).toBe(7);
    });

    it("returns null when the guest has no scored run", async () => {
      mockSelect.mockReturnValueOnce(query([{ streak: null }]));
      expect(await getGuestHighScore("guest-1")).toBeNull();
    });

    it("returns null without a database, never querying", async () => {
      process.env.DATABASE_URL = "";
      expect(await getGuestHighScore("guest-1")).toBeNull();
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });

  describe("recordGameResult", () => {
    it("upserts a signed-in user's run with a guard against lowering the score", async () => {
      await recordGameResult("user-1", null, "run-1", 5);

      expect(mockInsert).toHaveBeenCalledTimes(1);
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
      await recordGameResult(null, "guest-1", "run-2", 3);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, guestId: "guest-1", bestStreak: 3 }),
      );
    });

    it("does nothing without a database", async () => {
      process.env.DATABASE_URL = "";
      await recordGameResult("user-1", null, "run-1", 5);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("does nothing for a non-positive streak", async () => {
      await recordGameResult("user-1", null, "run-1", 0);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("does nothing when both or neither owner id is supplied", async () => {
      await recordGameResult("user-1", "guest-1", "run-1", 5);
      await recordGameResult(null, null, "run-1", 5);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("logs and swallows a database error rather than throwing", async () => {
      mockOnConflictDoUpdate.mockRejectedValue(new Error("db down"));
      await expect(recordGameResult("user-1", null, "run-1", 5)).resolves.toBeUndefined();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        "game_result_update_failed",
        "Failed to save game result",
        expect.objectContaining({ error: "db down" }),
      );
    });
  });
});
