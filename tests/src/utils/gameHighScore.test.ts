const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

const mockWhereSelect = jest.fn();
const mockFrom = jest.fn(() => ({ where: mockWhereSelect }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));

const mockOnConflictDoUpdate = jest.fn();
const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = jest.fn(() => ({ values: mockValues }));

const mockDb = { select: mockSelect, insert: mockInsert };
jest.mock("../../../src/db/client", () => ({ getDb: () => mockDb }));

import { getHighScore, updateHighScoreIfBeaten } from "../../../src/utils/gameHighScore";

describe("gameHighScore", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
    mockWhereSelect.mockResolvedValue([]);
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("getHighScore", () => {
    it("returns null without DATABASE_URL configured", async () => {
      delete process.env.DATABASE_URL;
      const result = await getHighScore("user-1");
      expect(result).toBeNull();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns the stored high score", async () => {
      mockWhereSelect.mockResolvedValueOnce([{ highScore: 4 }]);
      const result = await getHighScore("user-1");
      expect(result).toBe(4);
    });

    it("returns null when no row exists yet", async () => {
      mockWhereSelect.mockResolvedValueOnce([]);
      const result = await getHighScore("user-1");
      expect(result).toBeNull();
    });

    it("returns null and logs when the query fails", async () => {
      mockWhereSelect.mockRejectedValueOnce(new Error("db down"));
      const result = await getHighScore("user-1");
      expect(result).toBeNull();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        "game_high_score_get_failed",
        expect.any(String),
        expect.anything(),
      );
    });
  });

  describe("updateHighScoreIfBeaten", () => {
    it("no-ops without DATABASE_URL configured", async () => {
      delete process.env.DATABASE_URL;
      await updateHighScoreIfBeaten("user-1", 3);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("no-ops for a non-positive streak", async () => {
      await updateHighScoreIfBeaten("user-1", 0);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("upserts with a conditional update guarding against overwriting a higher score", async () => {
      await updateHighScoreIfBeaten("user-1", 5);
      expect(mockInsert).toHaveBeenCalled();
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
      await expect(updateHighScoreIfBeaten("user-1", 5)).resolves.toBeUndefined();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        "game_high_score_update_failed",
        expect.any(String),
        expect.anything(),
      );
    });
  });
});
