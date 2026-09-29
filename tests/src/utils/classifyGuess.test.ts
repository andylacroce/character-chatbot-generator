const mockCreate = jest.fn();
jest.mock("../../../src/utils/anthropicClient", () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...(args as [unknown])) } },
}));

jest.mock("../../../src/utils/claudeModelSelector", () => ({
  getClaudeModel: (_: string) => "claude-test",
}));

jest.mock("../../../src/utils/parseClaudeJson", () => ({
  extractJson: (text: string) => text.trim(),
}));

const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  __esModule: true,
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (m: unknown) => m,
}));

import { classifyGuess } from "../../../src/utils/classifyGuess";

function mockClaudeResponse(payload: Record<string, unknown>) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
}

describe("classifyGuess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("classifies a clear, correct guess", async () => {
    mockClaudeResponse({ reasoning: "matches", status: "clear", correct: true });
    const result = await classifyGuess("Sherlock Holmes", "It's Sherlock Holmes!", []);
    expect(result).toEqual({ status: "clear", correct: true });
  });

  it("classifies a clear, incorrect guess", async () => {
    mockClaudeResponse({ reasoning: "different person", status: "clear", correct: false });
    const result = await classifyGuess("Sherlock Holmes", "Is it Watson?", []);
    expect(result).toEqual({ status: "clear", correct: false });
  });

  it("classifies an ambiguous message and forces correct to false", async () => {
    mockClaudeResponse({ reasoning: "hedging", status: "ambiguous", correct: true });
    const result = await classifyGuess("Sherlock Holmes", "is it maybe someone from London?", []);
    expect(result).toEqual({ status: "ambiguous", correct: false });
  });

  it("classifies a give-up request", async () => {
    mockClaudeResponse({ reasoning: "wants out", status: "giveUp", correct: false });
    const result = await classifyGuess("Sherlock Holmes", "I give up, just tell me", []);
    expect(result).toEqual({ status: "giveUp", correct: false });
  });

  it("classifies an ordinary question as none", async () => {
    mockClaudeResponse({ reasoning: "just a question", status: "none", correct: false });
    const result = await classifyGuess("Sherlock Holmes", "What's your favorite case?", []);
    expect(result).toEqual({ status: "none", correct: false });
  });

  it("defaults an unrecognized status value to none", async () => {
    mockClaudeResponse({ reasoning: "weird", status: "not-a-real-status", correct: true });
    const result = await classifyGuess("Sherlock Holmes", "huh?", []);
    expect(result).toEqual({ status: "none", correct: false });
  });

  it("fails closed to 'none' on a malformed Claude response", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "not json" }] });
    const result = await classifyGuess("Sherlock Holmes", "garbled input", []);
    expect(result).toEqual({ status: "none", correct: false });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_guess_classify_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("fails closed to 'none' when the Anthropic call throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Claude is down"));
    const result = await classifyGuess("Sherlock Holmes", "It's Sherlock Holmes!", []);
    expect(result).toEqual({ status: "none", correct: false });
  });

  it("passes recent conversation history (last 6 entries) into the user message", async () => {
    mockClaudeResponse({ reasoning: "x", status: "none", correct: false });
    const history = ["Bot: line1", "User: line2", "Bot: line3", "User: line4", "Bot: line5", "User: line6", "Bot: line7"];
    await classifyGuess("Sherlock Holmes", "hello", history);
    const call = mockCreate.mock.calls[0][0];
    const userContent = call.messages[0].content as string;
    expect(userContent).not.toContain("line1");
    expect(userContent).toContain("line2");
    expect(userContent).toContain("line7");
  });

  it("grounds the hidden character with its source work when gameCharacterWork has an entry", async () => {
    mockClaudeResponse({ reasoning: "x", status: "none", correct: false });
    await classifyGuess("Beauty (Beauty and the Beast)", "hello", []);
    const call = mockCreate.mock.calls[0][0];
    const userContent = call.messages[0].content as string;
    expect(userContent).toContain(
      'Hidden character (trusted, for judging only): "Beauty (Beauty and the Beast)" — specifically the one from:',
    );
  });

  it("omits source-work grounding when gameCharacterWork has no entry", async () => {
    mockClaudeResponse({ reasoning: "x", status: "none", correct: false });
    await classifyGuess("Not A Real Curated Name", "hello", []);
    const call = mockCreate.mock.calls[0][0];
    const userContent = call.messages[0].content as string;
    expect(userContent).toContain('Hidden character (trusted, for judging only): "Not A Real Curated Name"');
    expect(userContent).not.toContain("specifically the one from");
  });

  it("logs the classifier's reasoning only for a clear classification", async () => {
    mockClaudeResponse({ reasoning: "matches", status: "clear", correct: true });
    await classifyGuess("Sherlock Holmes", "It's Sherlock Holmes!", []);
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "game_guess_classified",
      expect.any(String),
      expect.objectContaining({ correct: true, reasoning: "matches" }),
    );

    mockLogEvent.mockClear();
    mockClaudeResponse({ reasoning: "n/a", status: "none", correct: false });
    await classifyGuess("Sherlock Holmes", "hi", []);
    expect(mockLogEvent).not.toHaveBeenCalledWith(
      "info",
      "game_guess_classified",
      expect.anything(),
      expect.anything(),
    );
  });
});
