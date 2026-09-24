const mockList = jest.fn();
const mockDel = jest.fn();
jest.mock("@vercel/blob", () => ({
  list: (...args: unknown[]) => mockList(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

// select() results in call order: avatar_cache matches, then remaining bots matches.
const mockSelectResults: { url: string }[][] = [];
jest.mock("../../src/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => Promise.resolve(mockSelectResults.shift() ?? []) }),
    }),
  }),
}));

import { chatLogPrefix, deleteUserBlobs } from "../../src/utils/userBlobs";

const OWN = "https://abc.public.blob.vercel-storage.com/avatars/own.png";
const SHARED = "https://abc.public.blob.vercel-storage.com/avatars/shared.png";
const OTHER_USER = "https://abc.public.blob.vercel-storage.com/avatars/other.png";

describe("userBlobs", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectResults.length = 0;
    process.env = { ...OLD_ENV, BLOB_READ_WRITE_TOKEN: "tok" };
    mockList.mockResolvedValue({ blobs: [], hasMore: false });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("keeps guest logs at the root and hashes user ids into a prefix", () => {
    expect(chatLogPrefix(null)).toBe("");
    const prefix = chatLogPrefix("user-1");
    expect(prefix).toMatch(/^chat-logs\/users\/[0-9a-f]{64}\/$/);
    expect(prefix).not.toContain("user-1");
    expect(chatLogPrefix("user-2")).not.toBe(prefix);
  });

  it("is a no-op without a Blob token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(deleteUserBlobs("user-1", [OWN])).resolves.toBe(0);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("deletes only avatars nothing else references, skipping non-Blob URLs", async () => {
    mockSelectResults.push([{ url: SHARED }], [{ url: OTHER_USER }]);
    await expect(
      deleteUserBlobs("user-1", [OWN, SHARED, OTHER_USER, OWN, "/silhouette.svg", null]),
    ).resolves.toBe(1);
    expect(mockDel).toHaveBeenCalledWith([OWN], { token: "tok" });
  });

  it("leaves chat logs alone when chatLogs is false", async () => {
    await deleteUserBlobs("user-1", [], { chatLogs: false });
    expect(mockList).not.toHaveBeenCalled();
  });

  it("deletes every page of the user's chat logs", async () => {
    mockList
      .mockResolvedValueOnce({ blobs: [{ url: "a" }, { url: "b" }], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [{ url: "c" }], hasMore: false });

    await expect(deleteUserBlobs("user-1", [])).resolves.toBe(3);

    expect(mockList).toHaveBeenNthCalledWith(1, {
      prefix: chatLogPrefix("user-1"),
      cursor: undefined,
      token: "tok",
    });
    expect(mockList).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "c1" }));
    expect(mockDel).toHaveBeenCalledTimes(2);
  });
});
