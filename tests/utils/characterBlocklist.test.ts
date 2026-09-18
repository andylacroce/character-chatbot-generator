jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

/**
 * Minimal chainable Drizzle query-builder stand-in, mirroring generate-avatar.test.ts.
 * `select().from()` here supports both `.where()` (getBlocklistEntry) and `.orderBy()`
 * (listBlocklist) off the same rows, since drizzle's `.select()` always takes zero args
 * in this codebase's usage.
 */
function mockDbWith(selectRows: unknown[], deleteRows: unknown[] = []) {
  const mockWhere = jest.fn().mockResolvedValue(selectRows);
  const mockOrderBy = jest.fn().mockResolvedValue(selectRows);
  const mockSelect = jest.fn(() => ({ from: () => ({ where: mockWhere, orderBy: mockOrderBy }) }));
  const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
  const mockInsert = jest.fn(() => ({ values: mockValues }));
  const mockReturning = jest.fn().mockResolvedValue(deleteRows);
  const mockDeleteWhere = jest.fn(() => ({ returning: mockReturning }));
  const mockDelete = jest.fn(() => ({ where: mockDeleteWhere }));
  const mockDb = { select: mockSelect, insert: mockInsert, delete: mockDelete };
  jest.doMock("../../src/db/client", () => ({ getDb: () => mockDb }));
  return { mockWhere, mockOrderBy, mockInsert, mockValues, mockDelete, mockDeleteWhere };
}

describe("characterBlocklist utils", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("getBlocklistEntry", () => {
    it("returns null without DATABASE_URL", async () => {
      process.env.DATABASE_URL = "";
      const { getBlocklistEntry } = await import("../../src/utils/characterBlocklist");
      expect(await getBlocklistEntry("Elsa")).toBeNull();
    });

    it("returns the matching row, lowercasing the lookup key", async () => {
      await jest.isolateModulesAsync(async () => {
        const row = {
          characterName: "elsa",
          displayName: "Elsa",
          reason: "Disney trademark",
          source: "claude",
          createdAt: new Date(),
        };
        mockDbWith([row]);
        const { getBlocklistEntry } = await import("../../src/utils/characterBlocklist");
        const result = await getBlocklistEntry("Elsa");
        expect(result).toEqual(row);
      });
    });

    it("returns null on a miss", async () => {
      await jest.isolateModulesAsync(async () => {
        mockDbWith([]);
        const { getBlocklistEntry } = await import("../../src/utils/characterBlocklist");
        expect(await getBlocklistEntry("Nobody")).toBeNull();
      });
    });

    it("returns null and logs on a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        const mockWhere = jest.fn().mockRejectedValue(new Error("db down"));
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ select: () => ({ from: () => ({ where: mockWhere }) }) }),
        }));
        const { getBlocklistEntry } = await import("../../src/utils/characterBlocklist");
        expect(await getBlocklistEntry("Elsa")).toBeNull();
      });
    });
  });

  describe("addToBlocklist", () => {
    it("no-ops without DATABASE_URL", async () => {
      process.env.DATABASE_URL = "";
      const { addToBlocklist } = await import("../../src/utils/characterBlocklist");
      await expect(
        addToBlocklist("Elsa", "reason", "claude", "copyright"),
      ).resolves.toBeUndefined();
    });

    it("upserts with the lowercased key and original casing as displayName", async () => {
      await jest.isolateModulesAsync(async () => {
        const { mockValues } = mockDbWith([]);
        const { addToBlocklist } = await import("../../src/utils/characterBlocklist");
        await addToBlocklist("Elsa", "Disney trademark", "claude", "copyright");
        expect(mockValues).toHaveBeenCalledWith({
          characterName: "elsa",
          displayName: "Elsa",
          reason: "Disney trademark",
          source: "claude",
          category: "copyright",
        });
      });
    });

    it("swallows a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            insert: () => ({
              values: () => ({ onConflictDoUpdate: jest.fn().mockRejectedValue(new Error("x")) }),
            }),
          }),
        }));
        const { addToBlocklist } = await import("../../src/utils/characterBlocklist");
        await expect(addToBlocklist("Elsa", null, "admin", "content")).resolves.toBeUndefined();
      });
    });
  });

  describe("removeFromBlocklist", () => {
    it("returns false without DATABASE_URL", async () => {
      process.env.DATABASE_URL = "";
      const { removeFromBlocklist } = await import("../../src/utils/characterBlocklist");
      expect(await removeFromBlocklist("Elsa")).toBe(false);
    });

    it("returns true when a row was deleted", async () => {
      await jest.isolateModulesAsync(async () => {
        mockDbWith([], [{ characterName: "elsa" }]);
        const { removeFromBlocklist } = await import("../../src/utils/characterBlocklist");
        expect(await removeFromBlocklist("Elsa")).toBe(true);
      });
    });

    it("returns false when nothing existed to delete", async () => {
      await jest.isolateModulesAsync(async () => {
        mockDbWith([], []);
        const { removeFromBlocklist } = await import("../../src/utils/characterBlocklist");
        expect(await removeFromBlocklist("Nobody")).toBe(false);
      });
    });

    it("returns false and logs on a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            delete: () => ({
              where: () => ({ returning: jest.fn().mockRejectedValue(new Error("x")) }),
            }),
          }),
        }));
        const { removeFromBlocklist } = await import("../../src/utils/characterBlocklist");
        expect(await removeFromBlocklist("Elsa")).toBe(false);
      });
    });
  });

  describe("listBlocklist", () => {
    it("returns [] without DATABASE_URL", async () => {
      process.env.DATABASE_URL = "";
      const { listBlocklist } = await import("../../src/utils/characterBlocklist");
      expect(await listBlocklist()).toEqual([]);
    });

    it("returns every row, ordered", async () => {
      await jest.isolateModulesAsync(async () => {
        const rows = [{ characterName: "elsa" }, { characterName: "thor" }];
        const mockOrderBy = jest.fn().mockResolvedValue(rows);
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ select: () => ({ from: () => ({ orderBy: mockOrderBy }) }) }),
        }));
        const { listBlocklist } = await import("../../src/utils/characterBlocklist");
        expect(await listBlocklist()).toEqual(rows);
      });
    });

    it("returns [] and logs on a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            select: () => ({
              from: () => ({ orderBy: jest.fn().mockRejectedValue(new Error("x")) }),
            }),
          }),
        }));
        const { listBlocklist } = await import("../../src/utils/characterBlocklist");
        expect(await listBlocklist()).toEqual([]);
      });
    });
  });
});
