const mockCreate = jest.fn();
jest.mock("../../../src/utils/anthropicClient", () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock("../../../src/utils/claudeModelSelector", () => ({ getClaudeModel: () => "test-model" }));
jest.mock("../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (value: unknown) => value,
}));

import { checkLeaderboardName } from "../../../src/utils/leaderboardName";

describe("leaderboard display-name moderation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects markup and overlong names before calling the model", async () => {
    expect(await checkLeaderboardName("<script>")).toEqual({ status: "rejected" });
    expect(await checkLeaderboardName("x".repeat(31))).toEqual({ status: "rejected" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("publishes only an explicitly approved, normalized name", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: '{"allowed":true}' }] });
    expect(await checkLeaderboardName("  Ada   Lovelace  ")).toEqual({
      status: "approved",
      name: "Ada Lovelace",
    });
  });

  it("rejects abusive names", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: '{"allowed":false}' }] });
    expect(await checkLeaderboardName("Abusive Alias")).toEqual({ status: "rejected" });
  });

  it("fails closed when moderation is unavailable or malformed", async () => {
    mockCreate.mockRejectedValueOnce(new Error("offline"));
    expect(await checkLeaderboardName("Ada Lovelace")).toEqual({ status: "unavailable" });
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "{}" }] });
    expect(await checkLeaderboardName("Ada Lovelace")).toEqual({ status: "unavailable" });
  });
});
