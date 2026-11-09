import { buildAvatarPrompt } from "../../src/utils/avatar/avatarPrompt";

const mockCreate = jest.fn();
jest.mock("../../src/utils/claude/anthropicClient", () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock("../../src/utils/claude/claudeModelSelector", () => ({
  getClaudeModel: () => "test-model",
}));
jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

const reply = (obj: unknown) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });

describe("buildAvatarPrompt", () => {
  beforeEach(() => jest.clearAllMocks());

  it("assembles a prompt from Claude's fields and returns gender and category", async () => {
    mockCreate.mockResolvedValue(
      reply({
        subject: "a stately queen",
        artStyle: "oil painting",
        composition: "bust, 3/4 view",
        iconicElements: "gold crown",
        negativePrompts: "no text",
        gender: "female",
        category: "history",
      }),
    );
    const result = await buildAvatarPrompt("Cleopatra");
    expect(result.gender).toBe("female");
    expect(result.category).toBe("history");
    expect(result.prompt).toContain("a stately queen");
    expect(result.prompt).toContain("Style: oil painting");
    expect(result.prompt).toContain("Exclude: no text");
    expect(result.prompt).toContain('"Cleopatra"');
  });

  it("ignores an unknown category and a missing gender", async () => {
    mockCreate.mockResolvedValue(reply({ subject: "x", category: "wizards" }));
    const result = await buildAvatarPrompt("Gandalf");
    expect(result.category).toBeNull();
    expect(result.gender).toBeNull();
    expect(result.prompt).toContain("Style: stylized illustration");
  });

  it("caps the prompt at 1000 characters", async () => {
    mockCreate.mockResolvedValue(reply({ subject: "x".repeat(5000) }));
    expect((await buildAvatarPrompt("Zeus")).prompt).toHaveLength(1000);
  });

  it("falls back to a fixed generic portrait prompt when the call fails", async () => {
    mockCreate.mockRejectedValue(new Error("overloaded"));
    const result = await buildAvatarPrompt("Odysseus");
    expect(result.gender).toBeNull();
    expect(result.category).toBeNull();
    expect(result.prompt).toContain("generic archetype");
    expect(result.prompt).toContain('"Odysseus"');
  });

  it("falls back when Claude returns unparseable JSON", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "not json at all" }] });
    const result = await buildAvatarPrompt("Hera");
    expect(result.prompt).toContain("generic archetype");
  });
});
