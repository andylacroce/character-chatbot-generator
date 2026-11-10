import storage, {
  getVersionedJSON,
  setVersionedJSON,
  setJSON,
  getJSON,
} from "../../src/utils/storage";

describe("storage helpers", () => {
  beforeEach(() => {
    // Clear in-memory fallback before each test
    storage.clearMemoryFallback();
    // Ensure localStorage is clean before each test
    try {
      localStorage.clear();
    } catch {}
  });

  it("handles setVersionedJSON and getVersionedJSON", () => {
    const key = "test-versioned";
    const payload = { data: "test" };

    setVersionedJSON(key, payload, 2);

    const retrieved = getVersionedJSON<typeof payload>(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.v).toBe(2);
    expect(retrieved!.payload).toEqual(payload);
    expect(retrieved!.createdAt).toBeDefined();
  });

  it("handles malformed versioned JSON gracefully", () => {
    const key = "test-malformed";
    // Set malformed versioned JSON (missing required fields like createdAt and payload)
    storage.setItem(key, JSON.stringify({ v: 1 })); // Missing createdAt and payload fields

    const retrieved = getVersionedJSON(key);
    expect(retrieved).toBeNull();
  });

  it("handles setJSON and getJSON errors gracefully", () => {
    const key = "test-json-errors";

    // Test circular reference (should fail stringify but not throw)
    const circular: { self?: unknown } = {};
    circular.self = circular;

    // Should not throw
    expect(() => setJSON(key, circular)).not.toThrow();

    // Store invalid JSON manually
    storage.setItem(key, "invalid-json{]");

    // getJSON should return null for invalid JSON
    const result = getJSON(key);
    expect(result).toBeNull();
  });

  it("returns null for getJSON when key does not exist", () => {
    const result = getJSON("nonexistent");
    expect(result).toBeNull();
  });

  it("setVersionedJSON uses default version=1 when not specified", () => {
    // Exercises the default-arg branch: version = 1
    const key = "test-default-version";
    setVersionedJSON(key, { flag: true });
    const retrieved = getVersionedJSON<{ flag: boolean }>(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.v).toBe(1);
    expect(retrieved!.payload).toEqual({ flag: true });
  });

  it("removeItem falls back to in-memory when localStorage is unavailable", () => {
    // Force storageAvailable() to return false by making localStorage.removeItem throw
    const orig = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => {
      throw new Error("unavailable");
    };
    storage.setItem("fallback-key", "value");
    expect(() => storage.removeItem("fallback-key")).not.toThrow();
    Storage.prototype.removeItem = orig;
  });
});
