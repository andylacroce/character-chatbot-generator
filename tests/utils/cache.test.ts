import * as cache from "../../src/utils/cache";
import fs from "fs";

describe("cache utility", () => {
  const key = "testKey";
  const value = "testValue";
  const CACHE_FILE = "/tmp/bot-reply-cache.json";

  describe("Vercel (in-memory) mode", () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = "1";
      jest.resetModules();
      // Clear in-memory cache by resetting the module
      const mod = require.cache[require.resolve("../../src/utils/cache")];
      if (mod) delete require.cache[require.resolve("../../src/utils/cache")];
    });
    afterEach(() => {
      delete process.env.VERCEL_ENV;
    });

    it("set/get/delete works in memory", () => {
      const cacheMod = require("../../src/utils/cache");
      cacheMod.setReplyCache(key, value);
      expect(cacheMod.getReplyCache(key)).toBe(value);
      cacheMod.deleteReplyCache(key);
      expect(cacheMod.getReplyCache(key)).toBeNull();
    });
    it("get returns null for missing key", () => {
      const cacheMod = require("../../src/utils/cache");
      expect(cacheMod.getReplyCache("missing")).toBeNull();
    });
    it("delete does not throw for missing key", () => {
      const cacheMod = require("../../src/utils/cache");
      expect(() => cacheMod.deleteReplyCache("missing")).not.toThrow();
    });
    it("set overwrites existing key in memory", () => {
      const cacheMod = require("../../src/utils/cache");
      cacheMod.setReplyCache(key, value);
      cacheMod.setReplyCache(key, "newValue");
      expect(cacheMod.getReplyCache(key)).toBe("newValue");
    });
  });

  describe("Local (file-based) mode", () => {
    let existsSyncSpy: jest.SpyInstance;
    let readFileSyncSpy: jest.SpyInstance;
    let writeFileSyncSpy: jest.SpyInstance;

    beforeEach(() => {
      delete process.env.VERCEL_ENV;
      jest.resetModules();
      existsSyncSpy = jest.spyOn(fs, "existsSync");
      readFileSyncSpy = jest.spyOn(fs, "readFileSync");
      writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");
    });
    afterEach(() => {
      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
      writeFileSyncSpy.mockRestore();
    });

    it("set/get/delete works with file cache", () => {
      // Simulate file exists and contains an empty object
      existsSyncSpy.mockReturnValue(true);
      let cacheObj: Record<string, string> = {};
      readFileSyncSpy.mockImplementation(() => JSON.stringify(cacheObj));
      writeFileSyncSpy.mockImplementation((file, data) => {
        cacheObj = JSON.parse(data as string);
      });
      // Set
      cache.setReplyCache(key, value);
      expect(cacheObj[key]).toBe(value);
      // Get
      readFileSyncSpy.mockImplementation(() => JSON.stringify(cacheObj));
      expect(cache.getReplyCache(key)).toBe(value);
      // Delete
      cache.deleteReplyCache(key);
      expect(cacheObj[key]).toBeUndefined();
    });
    it("get returns null for missing key in file", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(JSON.stringify({}));
      expect(cache.getReplyCache("missing")).toBeNull();
    });
    it("delete does not throw for missing key in file", () => {
      existsSyncSpy.mockReturnValue(true);
      let cacheObj: Record<string, string> = {};
      readFileSyncSpy.mockReturnValue(JSON.stringify(cacheObj));
      writeFileSyncSpy.mockImplementation((file, data) => {
        cacheObj = JSON.parse(data as string);
      });
      expect(() => cache.deleteReplyCache("missing")).not.toThrow();
    });
    it("handles file read error gracefully", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockImplementation(() => {
        throw new Error("fail");
      });
      expect(cache.getReplyCache(key)).toBeNull();
    });
    it("handles file write error gracefully", () => {
      existsSyncSpy.mockReturnValue(true);
      let cacheObj: Record<string, string> = {};
      readFileSyncSpy.mockReturnValue(JSON.stringify(cacheObj));
      writeFileSyncSpy.mockImplementation(() => {
        throw new Error("fail");
      });
      expect(() => cache.setReplyCache(key, value)).not.toThrow();
      expect(() => cache.deleteReplyCache(key)).not.toThrow();
    });
    it("creates file if not exists", () => {
      existsSyncSpy.mockReturnValue(false);
      let cacheObj: Record<string, string> = {};
      readFileSyncSpy.mockReturnValue(JSON.stringify(cacheObj));
      writeFileSyncSpy.mockImplementation((file, data) => {
        cacheObj = JSON.parse(data as string);
      });
      cache.setReplyCache(key, value);
      expect(cacheObj[key]).toBe(value);
    });
  });
});
