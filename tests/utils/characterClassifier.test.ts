import { classifyCharacterName } from "../../src/utils/moderation/characterClassifier";

const mockCreate = jest.fn();
jest.mock("../../src/utils/claude/anthropicClient", () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
jest.mock("../../src/utils/claude/claudeModelSelector", () => ({
  getClaudeModel: () => "simple-model",
}));
jest.mock("../../src/utils/claude/claudeThinking", () => ({
  thinkingFor: () => ({ type: "disabled" }),
}));

describe("classifyCharacterName", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fills safe defaults from a sparse classification", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "{}" }] });
    await expect(classifyCharacterName("Sherlock Holmes")).resolves.toMatchObject({
      isSafe: true,
      blocked: false,
      recognized: true,
      warningLevel: "none",
    });
  });

  it("throws instead of reading a refusal's empty content as a clean name", async () => {
    mockCreate.mockResolvedValueOnce({ content: [], stop_reason: "refusal" });
    await expect(classifyCharacterName("Some Name")).rejects.toMatchObject({
      name: "ClaudeRefusalError",
    });
  });
});
