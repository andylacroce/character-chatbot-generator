import type { NextApiRequest, NextApiResponse } from "next";

jest.mock("../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => options,
  applyRateLimit: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../../src/utils/withRequestLog", () => ({
  withRequestLog: (handler: unknown) => handler,
}));

const mockGetOrGenerateAvatar = jest.fn();
jest.mock("../../../src/utils/avatarGeneration", () => ({
  getOrGenerateAvatar: (...args: unknown[]) => mockGetOrGenerateAvatar(...args),
}));

const mockIsAllowlisted = jest.fn();
jest.mock("../../../src/utils/characterAllowlist", () => ({
  isAllowlisted: (...args: unknown[]) => mockIsAllowlisted(...args),
}));

const mockGetBlocklistEntry = jest.fn();
jest.mock("../../../src/utils/characterBlocklist", () => ({
  getBlocklistEntry: (...args: unknown[]) => mockGetBlocklistEntry(...args),
}));

const mockClassify = jest.fn();
jest.mock("../../../src/utils/characterClassifier", () => ({
  classifyCharacterName: (...args: unknown[]) => mockClassify(...args),
}));
jest.mock("../../../src/utils/logger", () => ({ logEvent: jest.fn() }));

const handler = require("../../../src/pages/api/generate-avatar").default;

function makeRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

async function post(body: Record<string, unknown>) {
  const res = makeRes();
  await handler({ method: "POST", body } as NextApiRequest, res);
  return res;
}

describe("generate-avatar moderation gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAllowlisted.mockResolvedValue(false);
    mockGetBlocklistEntry.mockResolvedValue(null);
    mockGetOrGenerateAvatar.mockResolvedValue({ avatarUrl: "https://img/a.png", gender: "male" });
    mockClassify.mockResolvedValue({ blocked: false, recognized: true, warningLevel: "none" });
  });

  /** The moderation callback the route hands to avatar generation for a brand-new name. */
  const gate = () =>
    mockGetOrGenerateAvatar.mock.calls[0][1].mayPersistNew as () => Promise<boolean>;

  it("generates and persists normally for a name that isn't blocklisted", async () => {
    await post({ name: "Sherlock Holmes" });
    expect(mockGetOrGenerateAvatar).toHaveBeenCalledWith("Sherlock Holmes", {
      skipPersistence: false,
      mayPersistNew: expect.any(Function),
    });
  });

  it("lets a clean, recognized new name reach the Wall", async () => {
    await post({ name: "Sherlock Holmes" });
    expect(await gate()()).toBe(true);
    expect(mockClassify).toHaveBeenCalledWith("Sherlock Holmes");
  });

  it.each([
    ["blocked", { blocked: true, recognized: true, warningLevel: "none" }],
    ["unrecognized", { blocked: false, recognized: false, warningLevel: "none" }],
    ["flagged", { blocked: false, recognized: true, warningLevel: "caution" }],
  ])("keeps a %s new name off the Wall", async (_label, verdict) => {
    mockClassify.mockResolvedValue(verdict);
    await post({ name: "Sneaky Name" });
    expect(await gate()()).toBe(false);
  });

  it("fails closed when the moderation check errors", async () => {
    mockClassify.mockRejectedValue(new Error("down"));
    await post({ name: "Sneaky Name" });
    expect(await gate()()).toBe(false);
  });

  it("returns the silhouette without generating for a content-blocked name", async () => {
    mockGetBlocklistEntry.mockResolvedValue({ category: "content" });
    const res = await post({ name: "Blocked Name" });
    expect(mockGetOrGenerateAvatar).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ avatarUrl: "/silhouette.svg", gender: null });
  });

  it("forces a private, never-cached render for a copyright-blocked name", async () => {
    mockGetBlocklistEntry.mockResolvedValue({ category: "copyright" });
    await post({ name: "Mickey Mouse" });
    expect(mockGetOrGenerateAvatar).toHaveBeenCalledWith("Mickey Mouse", {
      skipPersistence: true,
      mayPersistNew: undefined,
    });
  });

  it("lets the allowlist override a stale blocklist row", async () => {
    mockIsAllowlisted.mockResolvedValue(true);
    mockGetBlocklistEntry.mockResolvedValue({ category: "content" });
    await post({ name: "Thor" });
    expect(mockGetBlocklistEntry).not.toHaveBeenCalled();
    expect(mockGetOrGenerateAvatar).toHaveBeenCalledWith("Thor", {
      skipPersistence: false,
      mayPersistNew: undefined,
    });
  });

  it("skips the moderation lookups for an already-private render", async () => {
    await post({ name: "Mickey Mouse", skipPersistence: true });
    expect(mockIsAllowlisted).not.toHaveBeenCalled();
    expect(mockGetOrGenerateAvatar).toHaveBeenCalledWith("Mickey Mouse", {
      skipPersistence: true,
      mayPersistNew: undefined,
    });
  });
});
