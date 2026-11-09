import { validateCharacterName } from "../../src/utils/moderation/validateCharacter";

const mockIsAllowlisted = jest.fn();
jest.mock("../../src/utils/moderation/characterAllowlist", () => ({
  isAllowlisted: (...a: unknown[]) => mockIsAllowlisted(...a),
}));
const mockGetBlock = jest.fn();
const mockAddBlock = jest.fn();
const mockRemoveBlock = jest.fn();
jest.mock("../../src/utils/moderation/characterBlocklist", () => ({
  getBlocklistEntry: (...a: unknown[]) => mockGetBlock(...a),
  addToBlocklist: (...a: unknown[]) => mockAddBlock(...a),
  removeFromBlocklist: (...a: unknown[]) => mockRemoveBlock(...a),
}));
const mockLogWarning = jest.fn();
jest.mock("../../src/utils/moderation/characterWarningLog", () => ({
  logWarning: (...a: unknown[]) => mockLogWarning(...a),
}));
const mockClassify = jest.fn();
jest.mock("../../src/utils/moderation/characterClassifier", () => ({
  classifyCharacterName: (...a: unknown[]) => mockClassify(...a),
}));
const mockScrubAvatar = jest.fn();
const mockScrubBots = jest.fn();
jest.mock("../../src/utils/avatar/avatarGeneration", () => ({
  scrubCachedAvatar: (...a: unknown[]) => mockScrubAvatar(...a),
  scrubUserBotsByName: (...a: unknown[]) => mockScrubBots(...a),
}));
const mockRecordEvent = jest.fn();
jest.mock("../../src/utils/analytics", () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));
jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

const safe = {
  characterName: "Zeus",
  isPublicDomain: true,
  isSafe: true,
  warningLevel: "none",
  reason: "",
  suggestions: [],
  blocked: false,
  recognized: true,
};

describe("validateCharacterName", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsAllowlisted.mockResolvedValue(false);
    mockGetBlock.mockResolvedValue(null);
    mockScrubAvatar.mockResolvedValue(false);
  });

  it("passes an allowlisted name without calling Claude, and heals a stale blocklist row", async () => {
    mockIsAllowlisted.mockResolvedValue(true);
    const result = await validateCharacterName("Thor");
    expect(result).toMatchObject({ warningLevel: "none", blocked: false, isSafe: true });
    expect(mockRemoveBlock).toHaveBeenCalledWith("Thor");
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it("hard-blocks a content-blocklisted name without calling Claude", async () => {
    mockGetBlock.mockResolvedValue({ source: "admin", category: "content" });
    const result = await validateCharacterName("Bad Name");
    expect(result).toMatchObject({ blocked: true, isSafe: false });
    expect(mockScrubAvatar).toHaveBeenCalledWith("Bad Name");
    expect(mockScrubBots).toHaveBeenCalledWith("Bad Name");
    expect(mockClassify).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "character_validated",
      expect.objectContaining({ blocked: true }),
    );
  });

  it("returns a scrubbed, non-overridable warning for a copyright-blocklisted name", async () => {
    mockGetBlock.mockResolvedValue({ source: "claude", category: "copyright" });
    const result = await validateCharacterName("Mickey Mouse");
    expect(result).toMatchObject({ warningLevel: "warning", scrubbed: true, blocked: false });
  });

  it("returns a clean classification as-is and records it", async () => {
    mockClassify.mockResolvedValue({ ...safe });
    const result = await validateCharacterName("Zeus");
    expect(result).toMatchObject({ warningLevel: "none", blocked: false });
    expect(mockAddBlock).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "character_validated",
      expect.objectContaining({ warningLevel: "none", scrubbed: false }),
    );
  });

  it("blocklists and logs a fresh warning, but leaves it overridable when it wasn't cached", async () => {
    mockClassify.mockResolvedValue({
      ...safe,
      warningLevel: "warning",
      isSafe: false,
      reason: "Disney",
    });
    const result = await validateCharacterName("Elsa");
    expect(mockAddBlock).toHaveBeenCalledWith("Elsa", "Disney", "claude", "copyright");
    expect(mockLogWarning).toHaveBeenCalledWith("Elsa", "Disney");
    expect(result.scrubbed).toBeUndefined();
    expect(result.reason).toBe("Disney");
  });

  it("scrubs and marks non-overridable a warning for an already-cached name", async () => {
    mockScrubAvatar.mockResolvedValue(true);
    mockClassify.mockResolvedValue({
      ...safe,
      warningLevel: "warning",
      isSafe: false,
      reason: "Disney",
      suggestions: ["Zeus"],
    });
    const result = await validateCharacterName("Elsa");
    expect(result).toMatchObject({ scrubbed: true, suggestions: [] });
    expect(result.reason).toMatch(/no longer available/);
  });

  it("blocklists a fresh content block as 'content' and scrubs saved copies", async () => {
    mockClassify.mockResolvedValue({ ...safe, blocked: true, isSafe: false, reason: "abusive" });
    const result = await validateCharacterName("Bad Name");
    expect(result.blocked).toBe(true);
    expect(mockAddBlock).toHaveBeenCalledWith("Bad Name", "abusive", "claude", "content");
    expect(mockScrubBots).toHaveBeenCalledWith("Bad Name");
  });

  it("fails open with a caution message when classification throws", async () => {
    mockClassify.mockRejectedValue(new Error("claude down"));
    const result = await validateCharacterName("Zeus");
    expect(result).toMatchObject({
      isSafe: true,
      warningLevel: "none",
      blocked: false,
      recognized: true,
    });
    expect(result.reason).toMatch(/proceed with caution/);
  });
});
