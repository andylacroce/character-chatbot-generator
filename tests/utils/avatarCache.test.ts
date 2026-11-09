const mockReturning = jest.fn();
const mockSelectRows = jest.fn();
const mockUpsert = jest.fn();
jest.mock("../../src/db/client", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: mockSelectRows }) }),
    delete: () => ({ where: () => ({ returning: mockReturning }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: mockUpsert }) }),
  }),
}));
const mockPut = jest.fn();
jest.mock("@vercel/blob", () => ({ put: (...args: unknown[]) => mockPut(...args) }));
jest.mock("../../src/utils/account/userBlobs", () => ({ deleteOrphanedAvatars: jest.fn() }));
jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

import {
  cacheAvatar,
  getCachedAvatar,
  persistAvatarToBlob,
  scrubUserBotsByName,
} from "../../src/utils/avatar/avatarCache";

const original = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
});
afterAll(() => {
  process.env = original;
});

const DATA_URL = "data:image/png;base64,aGVsbG8=";

describe("persistAvatarToBlob", () => {
  it("returns the data URL unchanged when no Blob token is configured", async () => {
    await expect(persistAvatarToBlob(DATA_URL)).resolves.toBe(DATA_URL);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("uploads to Blob and returns the durable URL", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "tok";
    mockPut.mockResolvedValue({ url: "https://blob/avatars/a.png" });
    await expect(persistAvatarToBlob(DATA_URL)).resolves.toBe("https://blob/avatars/a.png");
    expect(mockPut).toHaveBeenCalledWith(
      expect.stringMatching(/^avatars\/.+\.png$/),
      expect.any(Buffer),
      expect.objectContaining({ access: "public", contentType: "image/png", token: "tok" }),
    );
  });

  it("keeps the data URL when the upload fails or the input isn't an image data URL", async () => {
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN = "tok";
    mockPut.mockRejectedValue(new Error("blob down"));
    await expect(persistAvatarToBlob(DATA_URL)).resolves.toBe(DATA_URL);
    await expect(persistAvatarToBlob("https://already/remote.png")).resolves.toBe(
      "https://already/remote.png",
    );
  });
});

describe("getCachedAvatar and cacheAvatar", () => {
  it("do nothing without a database", async () => {
    delete process.env.DATABASE_URL;
    await expect(getCachedAvatar("Ada")).resolves.toBeNull();
    await cacheAvatar("Ada", "a.png", null, true, null);
    expect(mockSelectRows).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns a hit, and null on a miss or a database error", async () => {
    mockSelectRows.mockResolvedValueOnce([{ avatarUrl: "a.png", gender: "female" }]);
    await expect(getCachedAvatar("Ada")).resolves.toEqual({ avatarUrl: "a.png", gender: "female" });
    mockSelectRows.mockResolvedValueOnce([]);
    await expect(getCachedAvatar("Ada")).resolves.toBeNull();
    mockSelectRows.mockRejectedValueOnce(new Error("db down"));
    await expect(getCachedAvatar("Ada")).resolves.toBeNull();
  });

  it("swallows a write failure", async () => {
    mockUpsert.mockRejectedValue(new Error("db down"));
    await expect(cacheAvatar("Ada", "a.png", "female", true, "history")).resolves.toBeUndefined();
  });
});

describe("scrubUserBotsByName", () => {
  it("returns how many saved characters were removed", async () => {
    mockReturning.mockResolvedValue([{ id: "1" }, { id: "2" }]);
    await expect(scrubUserBotsByName("Blocked Name")).resolves.toBe(2);
  });

  it("returns 0 without a database or on a database error", async () => {
    delete process.env.DATABASE_URL;
    await expect(scrubUserBotsByName("X")).resolves.toBe(0);
    process.env.DATABASE_URL = "postgres://test";
    mockReturning.mockRejectedValue(new Error("db down"));
    await expect(scrubUserBotsByName("X")).resolves.toBe(0);
  });
});
