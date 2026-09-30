jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

interface FsMock {
  existsSync: jest.Mock;
  readFileSync: jest.Mock;
  writeFileSync: jest.Mock;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Loads a fresh cache module (it keeps in-memory state and reads VERCEL_ENV at call time) and
 * the `fs` mock instance that module actually sees; `jest.resetModules()` replaces that
 * instance, so stubs must be set on the one returned here. `file` seeds the cache file.
 */
function load(file?: unknown) {
  jest.resetModules();
  const fs = jest.requireMock("fs") as FsMock;
  fs.existsSync.mockReturnValue(file !== undefined);
  if (file !== undefined) {
    fs.readFileSync.mockReturnValue(typeof file === "string" ? file : JSON.stringify(file));
  }
  const cache: typeof import("../../src/utils/cache") = jest.requireActual("../../src/utils/cache");
  return { cache, fs };
}

describe("cache utility", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.VERCEL_ENV;
  });
  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  describe("in Vercel (memory only)", () => {
    let now = 0;
    beforeEach(() => {
      process.env.VERCEL_ENV = "1";
      now = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => now);
    });

    it("sets and gets without touching the file, and keeps entries until the TTL", () => {
      const { cache, fs } = load();
      cache.setReplyCache("k", "v");
      expect(cache.getReplyCache("k")).toBe("v");
      now += DAY - 1000;
      expect(cache.getReplyCache("k")).toBe("v");
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("drops an entry past the TTL", () => {
      const { cache } = load();
      cache.setReplyCache("k", "v");
      now += DAY + 1;
      expect(cache.getReplyCache("k")).toBeNull();
    });

    it("cleans up when the cache exceeds its max size, keeping the newest entry", () => {
      const { cache } = load();
      for (let i = 0; i < 1001; i++) cache.setReplyCache(`bulk-${i}`, `val-${i}`);
      now += 1000;
      cache.setReplyCache("post-cleanup", "alive");
      expect(cache.getReplyCache("post-cleanup")).toBe("alive");
    });
  });

  describe("outside Vercel (file-backed)", () => {
    it("returns a fresh entry and saves its refreshed timestamp", () => {
      const { cache, fs } = load({ k: { value: "file-val", timestamp: Date.now() } });
      expect(cache.getReplyCache("k")).toBe("file-val");
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("returns null for a missing key", () => {
      const { cache } = load({ baz: { value: "qux", timestamp: Date.now() } });
      expect(cache.getReplyCache("foo")).toBeNull();
    });

    it("removes and saves when the entry is expired", () => {
      const { cache, fs } = load({ stale: { value: "x", timestamp: Date.now() - DAY - 1000 } });
      expect(cache.getReplyCache("stale")).toBeNull();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("keeps every live entry when setting alongside several others", () => {
      const now = Date.now();
      const { cache, fs } = load({
        a: { value: "a", timestamp: now - 1000 },
        b: { value: "b", timestamp: now },
      });
      cache.setReplyCache("c", "v-c");
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(Object.keys(written).sort()).toEqual(["a", "b", "c"]);
    });

    it("degrades to an empty cache on invalid JSON and still persists on set", () => {
      const { cache, fs } = load("not-json");
      expect(cache.getReplyCache("foo")).toBeNull();
      cache.setReplyCache("k1", "v1");
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("handles a read error", () => {
      const { cache, fs } = load({});
      fs.readFileSync.mockImplementation(() => {
        throw new Error("fail");
      });
      expect(cache.getReplyCache("foo")).toBeNull();
    });

    it("handles a write error", () => {
      const { cache, fs } = load();
      fs.writeFileSync.mockImplementation(() => {
        throw new Error("fail");
      });
      expect(() => cache.setReplyCache("foo", "bar")).not.toThrow();
    });
  });
});
