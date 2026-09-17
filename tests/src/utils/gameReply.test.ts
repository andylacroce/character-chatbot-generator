const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => ({
  default: function AnthropicMock() {
    return { messages: { create: mockCreate } };
  },
  __esModule: true,
}));

jest.mock("../../../src/utils/claudeModelSelector", () => ({
  getClaudeModel: (_: string) => "claude-test",
}));

const mockLogEvent = jest.fn();
const mockSanitize = jest.fn((m: unknown) => m);
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (m: unknown) => mockSanitize(m),
}));

// Required (not statically imported) after the mocks above are registered — a static
// import of a module that transitively constructs the (mocked) Anthropic client at
// import time gets hoisted above the `const mockCreate = jest.fn()` declarations by the
// CommonJS transform, causing a "Cannot access before initialization" TDZ error. Every
// other Anthropic-mocking test file in this repo (e.g. validate-character.test.ts,
// generate-avatar.test.ts) avoids this the same way.
const { getGameReply, getOpeningReply } = require("../../../src/utils/gameReply");

describe("gameReply", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getGameReply", () => {
    it("returns the stripped/formatted reply text on the happy path", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "*smiles* Hello, detective." }],
      });
      const reply = await getGameReply("You are a mystery character.", [], "Who are you?", 1);
      expect(reply).toBe("Hello, detective.");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-test",
          max_tokens: 300,
          temperature: 0.8,
        }),
      );
    });

    it("throws when Claude's response has no text content", async () => {
      mockCreate.mockResolvedValueOnce({ content: [{ type: "image" }] });
      await expect(getGameReply("persona", [], "hi", 1)).rejects.toThrow(
        "Generated game reply is empty.",
      );
    });

    it("throws when the response is not a valid Claude response shape", async () => {
      mockCreate.mockResolvedValueOnce({ notContent: true });
      await expect(getGameReply("persona", [], "hi", 1)).rejects.toThrow(
        "Invalid response from Claude",
      );
    });

    it("throws when the reply text is empty after trimming", async () => {
      mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "   " }] });
      await expect(getGameReply("persona", [], "hi", 1)).rejects.toThrow(
        "Generated game reply is empty.",
      );
    });
  });

  describe("getOpeningReply", () => {
    it("returns whatever getGameReply would return on the happy path", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Greetings, mortal." }],
      });
      const reply = await getOpeningReply("persona prompt");
      expect(reply).toBe("Greetings, mortal.");
    });

    it("resolves to the fallback string and logs a warn event when the Claude call rejects", async () => {
      mockCreate.mockRejectedValueOnce(new Error("network blip"));
      const reply = await getOpeningReply("persona prompt");
      expect(reply).toBe("Hello there! Great to meet you, ask me anything.");
      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "game_opening_reply_fallback",
        "Failed to generate a round's opening reply, using fallback",
        expect.any(Object),
      );
    });

    it("never throws even when the underlying reply is empty", async () => {
      mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "" }] });
      const reply = await getOpeningReply("persona prompt");
      expect(reply).toBe("Hello there! Great to meet you, ask me anything.");
      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "game_opening_reply_fallback",
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
