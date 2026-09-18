jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

describe("characterAllowlist", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, DATABASE_URL: "" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("isCuratedAllowlisted", () => {
    it("matches a curated public-domain name case-insensitively", async () => {
      const { isCuratedAllowlisted } = await import("../../src/utils/characterAllowlist");
      expect(isCuratedAllowlisted("Sherlock Holmes")).toBe(true);
      expect(isCuratedAllowlisted("sherlock holmes")).toBe(true);
      expect(isCuratedAllowlisted("SHERLOCK HOLMES")).toBe(true);
    });

    it("matches the exact names a live sweep found misclassified", async () => {
      const { isCuratedAllowlisted } = await import("../../src/utils/characterAllowlist");
      expect(isCuratedAllowlisted("Thor")).toBe(true);
      expect(isCuratedAllowlisted("Winnie-the-Pooh")).toBe(true);
    });

    it("tolerates surrounding whitespace", async () => {
      const { isCuratedAllowlisted } = await import("../../src/utils/characterAllowlist");
      expect(isCuratedAllowlisted("  Thor  ")).toBe(true);
    });

    it("does not match a name with no independent existence outside a corporate work", async () => {
      const { isCuratedAllowlisted } = await import("../../src/utils/characterAllowlist");
      expect(isCuratedAllowlisted("Spider-Man")).toBe(false);
      expect(isCuratedAllowlisted("Pikachu")).toBe(false);
    });

    it("does not match an unrecognized/invented name", async () => {
      const { isCuratedAllowlisted } = await import("../../src/utils/characterAllowlist");
      expect(isCuratedAllowlisted("Zzyxx Blorptron")).toBe(false);
    });
  });

  describe("isAllowlisted (combined static + DB check)", () => {
    it("returns true immediately for a curated name, without touching the DB", async () => {
      const { isAllowlisted } = await import("../../src/utils/characterAllowlist");
      expect(await isAllowlisted("Thor")).toBe(true);
    });

    it("falls back to the DB-backed allowlist for a non-curated name", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        const mockWhere = jest.fn().mockResolvedValue([{ characterName: "alice munro" }]);
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ select: () => ({ from: () => ({ where: mockWhere }) }) }),
        }));
        const { isAllowlisted } = await import("../../src/utils/characterAllowlist");
        expect(await isAllowlisted("Alice Munro")).toBe(true);
      });
    });

    it("returns false when neither the curated list nor the DB has a match", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        const mockWhere = jest.fn().mockResolvedValue([]);
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ select: () => ({ from: () => ({ where: mockWhere }) }) }),
        }));
        const { isAllowlisted } = await import("../../src/utils/characterAllowlist");
        expect(await isAllowlisted("Spider-Man")).toBe(false);
      });
    });
  });

  describe("getAllowlistEntry", () => {
    it("returns null without DATABASE_URL", async () => {
      const { getAllowlistEntry } = await import("../../src/utils/characterAllowlist");
      expect(await getAllowlistEntry("Elsa")).toBeNull();
    });

    it("returns null and logs on a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            select: () => ({
              from: () => ({ where: jest.fn().mockRejectedValue(new Error("x")) }),
            }),
          }),
        }));
        const { getAllowlistEntry } = await import("../../src/utils/characterAllowlist");
        expect(await getAllowlistEntry("Elsa")).toBeNull();
      });
    });
  });

  describe("addToAllowlist", () => {
    it("no-ops without DATABASE_URL", async () => {
      const { addToAllowlist } = await import("../../src/utils/characterAllowlist");
      await expect(addToAllowlist("Elsa", "reason")).resolves.toBeUndefined();
    });

    it("upserts with source 'admin'", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
        const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ insert: () => ({ values: mockValues }) }),
        }));
        const { addToAllowlist } = await import("../../src/utils/characterAllowlist");
        await addToAllowlist("Elsa", "Real person, mis-flagged");
        expect(mockValues).toHaveBeenCalledWith({
          characterName: "elsa",
          displayName: "Elsa",
          reason: "Real person, mis-flagged",
          source: "admin",
        });
      });
    });

    it("swallows a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            insert: () => ({
              values: () => ({ onConflictDoUpdate: jest.fn().mockRejectedValue(new Error("x")) }),
            }),
          }),
        }));
        const { addToAllowlist } = await import("../../src/utils/characterAllowlist");
        await expect(addToAllowlist("Elsa", null)).resolves.toBeUndefined();
      });
    });
  });

  describe("removeFromAllowlist", () => {
    it("returns false without DATABASE_URL", async () => {
      const { removeFromAllowlist } = await import("../../src/utils/characterAllowlist");
      expect(await removeFromAllowlist("Elsa")).toBe(false);
    });

    it("returns true when a row was deleted", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        const mockReturning = jest.fn().mockResolvedValue([{ characterName: "elsa" }]);
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ delete: () => ({ where: () => ({ returning: mockReturning }) }) }),
        }));
        const { removeFromAllowlist } = await import("../../src/utils/characterAllowlist");
        expect(await removeFromAllowlist("Elsa")).toBe(true);
      });
    });

    it("returns false when nothing existed to delete", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        const mockReturning = jest.fn().mockResolvedValue([]);
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ delete: () => ({ where: () => ({ returning: mockReturning }) }) }),
        }));
        const { removeFromAllowlist } = await import("../../src/utils/characterAllowlist");
        expect(await removeFromAllowlist("Nobody")).toBe(false);
      });
    });

    it("returns false and logs on a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            delete: () => ({
              where: () => ({ returning: jest.fn().mockRejectedValue(new Error("x")) }),
            }),
          }),
        }));
        const { removeFromAllowlist } = await import("../../src/utils/characterAllowlist");
        expect(await removeFromAllowlist("Elsa")).toBe(false);
      });
    });
  });

  describe("listAllowlist", () => {
    it("returns [] without DATABASE_URL", async () => {
      const { listAllowlist } = await import("../../src/utils/characterAllowlist");
      expect(await listAllowlist()).toEqual([]);
    });

    it("returns every row, ordered", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        const rows = [{ characterName: "elsa" }];
        const mockOrderBy = jest.fn().mockResolvedValue(rows);
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ select: () => ({ from: () => ({ orderBy: mockOrderBy }) }) }),
        }));
        const { listAllowlist } = await import("../../src/utils/characterAllowlist");
        expect(await listAllowlist()).toEqual(rows);
      });
    });

    it("returns [] and logs on a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host/db";
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            select: () => ({
              from: () => ({ orderBy: jest.fn().mockRejectedValue(new Error("x")) }),
            }),
          }),
        }));
        const { listAllowlist } = await import("../../src/utils/characterAllowlist");
        expect(await listAllowlist()).toEqual([]);
      });
    });
  });
});
