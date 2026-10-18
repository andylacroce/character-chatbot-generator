// Drizzle chains, controllable per test: select() rows, delete().returning() rows, insert().
const mockSelectRows = jest.fn();
const mockReturning = jest.fn();
const mockUpsert = jest.fn();
jest.mock("../../src/db/client", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: mockSelectRows }) }),
    delete: () => ({ where: () => ({ returning: mockReturning }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: mockUpsert }) }),
  }),
}));
const mockDeleteOrphanedAvatars = jest.fn();
jest.mock("../../src/utils/userBlobs", () => ({
  deleteOrphanedAvatars: (...args: unknown[]) => mockDeleteOrphanedAvatars(...args),
}));
// No Claude client: the prompt step throws and falls back to the generic prompt.
jest.mock("../../src/utils/anthropicClient", () => ({ __esModule: true, default: {} }));
const mockCloudflare = jest.fn();
jest.mock("../../src/utils/cloudflareImageGen", () => ({
  generateImageWithCloudflare: (...args: unknown[]) => mockCloudflare(...args),
}));
const mockPollinations = jest.fn();
jest.mock("../../src/utils/pollinationsImageGen", () => ({
  generateImageWithPollinations: (...args: unknown[]) => mockPollinations(...args),
}));

import {
  purgeCachedAvatar,
  regenerateCachedAvatar,
  scrubCachedAvatar,
} from "../../src/utils/avatarGeneration";

const original = process.env.DATABASE_URL;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  mockDeleteOrphanedAvatars.mockResolvedValue(1);
  mockUpsert.mockResolvedValue(undefined);
});
afterAll(() => {
  process.env.DATABASE_URL = original;
});

describe("purgeCachedAvatar", () => {
  it("deletes the row, then cleans up its now-unused Blob image", async () => {
    const url = "https://x.blob.vercel-storage.com/avatars/a.png";
    mockReturning.mockResolvedValue([{ avatarUrl: url }]);
    await expect(purgeCachedAvatar("Ada Lovelace")).resolves.toBe(true);
    expect(mockDeleteOrphanedAvatars).toHaveBeenCalledWith([url]);
  });

  it("returns false and skips Blob cleanup when the name wasn't cached", async () => {
    mockReturning.mockResolvedValue([]);
    await expect(purgeCachedAvatar("Nobody")).resolves.toBe(false);
    expect(mockDeleteOrphanedAvatars).not.toHaveBeenCalled();
  });

  it("still succeeds when Blob cleanup fails", async () => {
    mockReturning.mockResolvedValue([{ avatarUrl: "https://x/a.png" }]);
    mockDeleteOrphanedAvatars.mockRejectedValue(new Error("blob down"));
    await expect(purgeCachedAvatar("Ada")).resolves.toBe(true);
  });

  it("throws on a DB failure instead of reporting a false purge", async () => {
    mockReturning.mockRejectedValue(new Error("db down"));
    await expect(purgeCachedAvatar("Ada")).rejects.toThrow("db down");
  });

  it("is a no-op without DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    await expect(purgeCachedAvatar("Ada")).resolves.toBe(false);
    expect(mockReturning).not.toHaveBeenCalled();
  });
});

describe("regenerateCachedAvatar", () => {
  beforeEach(() => {
    mockSelectRows.mockResolvedValue([{ avatarUrl: "https://old/a.png", gender: "female" }]);
    mockCloudflare.mockResolvedValue("data:image/png;base64,AAAA");
  });

  it("generates past the cache, overwrites the row, and cleans up the old image", async () => {
    await expect(regenerateCachedAvatar("Ada Lovelace")).resolves.toBe(
      "data:image/png;base64,AAAA",
    );
    expect(mockCloudflare).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockDeleteOrphanedAvatars).toHaveBeenCalledWith(["https://old/a.png"]);
  });

  it("returns null and leaves the old portrait when no provider produces an image", async () => {
    mockCloudflare.mockResolvedValue(null);
    mockPollinations.mockResolvedValue(null);
    await expect(regenerateCachedAvatar("Ada Lovelace")).resolves.toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteOrphanedAvatars).not.toHaveBeenCalled();
  });

  it("still succeeds when old-image cleanup fails", async () => {
    mockDeleteOrphanedAvatars.mockRejectedValue(new Error("blob down"));
    await expect(regenerateCachedAvatar("Ada Lovelace")).resolves.toBe(
      "data:image/png;base64,AAAA",
    );
  });
});

describe("scrubCachedAvatar (shares the row delete)", () => {
  it("still reports whether a row existed and never throws", async () => {
    mockReturning.mockResolvedValueOnce([{ avatarUrl: "u" }]);
    await expect(scrubCachedAvatar("Ada")).resolves.toBe(true);
    mockReturning.mockRejectedValueOnce(new Error("db down"));
    await expect(scrubCachedAvatar("Ada")).resolves.toBe(false);
  });
});
