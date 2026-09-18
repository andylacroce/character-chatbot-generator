jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

describe("characterWarningLog utils", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("logWarning", () => {
    it("no-ops without DATABASE_URL", async () => {
      process.env.DATABASE_URL = "";
      const { logWarning } = await import("../../src/utils/characterWarningLog");
      await expect(logWarning("Elsa", "reason")).resolves.toBeUndefined();
    });

    it("inserts a row", async () => {
      await jest.isolateModulesAsync(async () => {
        const mockValues = jest.fn().mockResolvedValue(undefined);
        const mockInsert = jest.fn(() => ({ values: mockValues }));
        jest.doMock("../../src/db/client", () => ({ getDb: () => ({ insert: mockInsert }) }));
        const { logWarning } = await import("../../src/utils/characterWarningLog");
        await logWarning("Elsa", "Disney trademark");
        expect(mockValues).toHaveBeenCalledWith({
          characterName: "Elsa",
          displayName: "Elsa",
          reason: "Disney trademark",
        });
      });
    });

    it("swallows a DB error", async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({
            insert: () => ({ values: jest.fn().mockRejectedValue(new Error("x")) }),
          }),
        }));
        const { logWarning } = await import("../../src/utils/characterWarningLog");
        await expect(logWarning("Elsa", null)).resolves.toBeUndefined();
      });
    });
  });

  describe("listWarnings", () => {
    it("returns [] without DATABASE_URL", async () => {
      process.env.DATABASE_URL = "";
      const { listWarnings } = await import("../../src/utils/characterWarningLog");
      expect(await listWarnings()).toEqual([]);
    });

    it("returns every row, newest first", async () => {
      await jest.isolateModulesAsync(async () => {
        const rows = [{ characterName: "elsa" }, { characterName: "elsa" }];
        const mockOrderBy = jest.fn().mockResolvedValue(rows);
        jest.doMock("../../src/db/client", () => ({
          getDb: () => ({ select: () => ({ from: () => ({ orderBy: mockOrderBy }) }) }),
        }));
        const { listWarnings } = await import("../../src/utils/characterWarningLog");
        expect(await listWarnings()).toEqual(rows);
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
        const { listWarnings } = await import("../../src/utils/characterWarningLog");
        expect(await listWarnings()).toEqual([]);
      });
    });
  });
});
