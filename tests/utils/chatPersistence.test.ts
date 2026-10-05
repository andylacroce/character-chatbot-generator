const mockLogEvent = jest.fn();
jest.mock("../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));
jest.mock("../../src/utils/environment", () => ({ getCurrentEnvironment: () => "test" }));

/** Drizzle-like thenable query resolving to `rows`, or rejecting when `fail` is set. */
let rows: unknown[] = [];
let fail = false;
const query = () => {
  const q: Record<string, unknown> = {};
  for (const name of ["from", "where", "orderBy", "set"]) q[name] = () => q;
  q.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    (fail ? Promise.reject(new Error("db down")) : Promise.resolve(rows)).then(resolve, reject);
  return q;
};
const mockInsertValues = jest.fn();
const mockUpdateSet = jest.fn();
const mockDb = {
  select: () => query(),
  insert: () => ({
    values: (v: unknown) => {
      mockInsertValues(v);
      return query();
    },
  }),
  update: () => ({
    set: (v: unknown) => {
      mockUpdateSet(v);
      return query();
    },
  }),
};
jest.mock("../../src/db/client", () => ({ getDb: () => mockDb }));

import {
  fetchUnsummarizedMessages,
  finalizeChatPersistence,
  lookupBot,
  lookupUserPreferredName,
  type BotRow,
} from "../../src/utils/chatPersistence";

const bot = { id: "bot-1", name: "DArtagnan" } as BotRow;

describe("chatPersistence", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://test" };
    rows = [];
    fail = false;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("lookups", () => {
    it("finds the saved bot by its sanitized name", async () => {
      rows = [bot];
      await expect(lookupBot("u1", "D'Artagnan")).resolves.toBe(bot);
    });

    it("returns null for an empty name, no match, or a DB error (logging the error)", async () => {
      await expect(lookupBot("u1", "<>")).resolves.toBeNull();
      await expect(lookupBot("u1", "Nobody")).resolves.toBeNull();
      fail = true;
      await expect(lookupBot("u1", "Ada")).resolves.toBeNull();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        "chat_bot_lookup_failed",
        expect.any(String),
        expect.anything(),
      );
    });

    it("reads the stored preferred name, tolerating absence and errors", async () => {
      rows = [{ preferredName: "Sam" }];
      await expect(lookupUserPreferredName("u1")).resolves.toBe("Sam");
      rows = [];
      await expect(lookupUserPreferredName("u1")).resolves.toBeNull();
      fail = true;
      await expect(lookupUserPreferredName("u1")).resolves.toBeNull();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        "chat_user_name_lookup_failed",
        expect.any(String),
        expect.anything(),
      );
    });

    it("lists messages after a checkpoint (or all), degrading to [] on error", async () => {
      rows = [{ id: 5 }];
      await expect(fetchUnsummarizedMessages("bot-1", null)).resolves.toEqual([{ id: 5 }]);
      await expect(fetchUnsummarizedMessages("bot-1", 4)).resolves.toEqual([{ id: 5 }]);
      fail = true;
      await expect(fetchUnsummarizedMessages("bot-1", null)).resolves.toEqual([]);
    });

    it("no-ops without a database", async () => {
      delete process.env.DATABASE_URL;
      await expect(lookupBot("u1", "Ada")).resolves.toBeNull();
      await expect(lookupUserPreferredName("u1")).resolves.toBeNull();
      await expect(fetchUnsummarizedMessages("bot-1", null)).resolves.toEqual([]);
    });
  });

  describe("finalizeChatPersistence", () => {
    it("does nothing for a guest or unsaved character", async () => {
      await finalizeChatPersistence(null, "hi", "Ada", "hello", null, false);
      expect(mockInsertValues).not.toHaveBeenCalled();
    });

    it("stores the turn under the saved bot's own name, not the request's raw one", async () => {
      await finalizeChatPersistence(bot, "hi", "D'Artagnan", "hello", null, false);
      expect(mockInsertValues).toHaveBeenCalledWith([
        { botId: "bot-1", sender: "User", text: "hi" },
        { botId: "bot-1", sender: "DArtagnan", text: "hello" },
      ]);
    });

    it("persists only the bot's reply for the intro prompt", async () => {
      await finalizeChatPersistence(bot, "Introduce yourself", "Ada", "I am Ada.", null, true);
      expect(mockInsertValues).toHaveBeenCalledWith([
        { botId: "bot-1", sender: "DArtagnan", text: "I am Ada." },
      ]);
    });

    it("advances the summary checkpoint when one is supplied", async () => {
      await finalizeChatPersistence(
        bot,
        "hi",
        "Ada",
        "hello",
        { summary: "so far", throughMessageId: 9 },
        false,
      );
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ summary: "so far", summarizedThroughMessageId: 9 }),
      );
    });

    it("never throws when a write fails, and logs it", async () => {
      fail = true;
      await expect(
        finalizeChatPersistence(
          bot,
          "hi",
          "Ada",
          "hello",
          { summary: "s", throughMessageId: 1 },
          false,
        ),
      ).resolves.toBeUndefined();
      const events = mockLogEvent.mock.calls.map((c) => c[1]);
      expect(events).toEqual(
        expect.arrayContaining(["chat_persist_turn_failed", "chat_persist_summary_failed"]),
      );
    });

    it("skips every write without a database", async () => {
      delete process.env.DATABASE_URL;
      await finalizeChatPersistence(
        bot,
        "hi",
        "Ada",
        "hello",
        { summary: "s", throughMessageId: 1 },
        false,
      );
      expect(mockInsertValues).not.toHaveBeenCalled();
      expect(mockUpdateSet).not.toHaveBeenCalled();
    });
  });
});
