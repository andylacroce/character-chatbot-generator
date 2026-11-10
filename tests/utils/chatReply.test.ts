import { createClaudeReply, streamClaudeReply } from "../../src/utils/chat/chatReply";
import { logEvent } from "../../src/utils/logger";

const mockCreate = jest.fn();
const mockStream = jest.fn();
jest.mock("../../src/utils/claude/anthropicClient", () => ({
  __esModule: true,
  default: {
    messages: {
      create: (...a: unknown[]) => mockCreate(...a),
      stream: (...a: unknown[]) => mockStream(...a),
    },
  },
}));
jest.mock("../../src/utils/claude/claudeModelSelector", () => ({
  getClaudeModel: () => "text-model",
}));
jest.mock("../../src/utils/claude/claudeThinking", () => ({
  thinkingFor: () => ({ type: "off" }),
}));
jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));
const mockWriteFrame = jest.fn();

const messages = [{ role: "user" as const, content: "hi" }];
const text = (t: string) => ({ content: [{ type: "text", text: t }] });

async function* chunks(parts: Array<string | { other: true }>) {
  for (const p of parts) {
    if (typeof p === "string") {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: p } };
    } else {
      yield { type: "message_start" };
    }
  }
}

describe("streamClaudeReply", () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes each text chunk as a frame and returns the full reply", async () => {
    mockStream.mockReturnValue(chunks(["Hello, ", { other: true }, "traveller."]));
    await expect(streamClaudeReply(mockWriteFrame, "sys", messages)).resolves.toBe(
      "Hello, traveller.",
    );
    expect(mockWriteFrame).toHaveBeenCalledTimes(2);
    expect(mockWriteFrame).toHaveBeenNthCalledWith(1, { chunk: "Hello, ", done: false });
  });

  it("returns an empty string when Claude says nothing", async () => {
    mockStream.mockReturnValue(chunks([""]));
    await expect(streamClaudeReply(mockWriteFrame, "sys", messages)).resolves.toBe("");
    expect(mockWriteFrame).not.toHaveBeenCalled();
  });

  it("uses the shared reply settings", async () => {
    mockStream.mockReturnValue(chunks([]));
    await streamClaudeReply(mockWriteFrame, "SYSTEM", messages);
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "text-model",
        system: "SYSTEM",
        messages,
        max_tokens: 500,
        stop_sequences: ["User:", "Bot:"],
      }),
    );
  });
});

describe("createClaudeReply", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it("returns the trimmed reply text", async () => {
    mockCreate.mockResolvedValue(text("  Greetings.  "));
    await expect(createClaudeReply("sys", messages, "req-1")).resolves.toBe("Greetings.");
  });

  it("returns null and logs when Claude takes longer than 20 seconds", async () => {
    jest.useFakeTimers();
    mockCreate.mockReturnValue(new Promise(() => {}));
    const pending = createClaudeReply("sys", messages, "req-2");
    await jest.advanceTimersByTimeAsync(20000);
    await expect(pending).resolves.toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      "warn",
      "chat_timeout",
      expect.any(String),
      expect.anything(),
    );
  });

  it("throws on a response of the wrong shape", async () => {
    mockCreate.mockResolvedValue({ nope: true });
    await expect(createClaudeReply("sys", messages, "req-3")).rejects.toThrow(
      "Invalid response from Claude",
    );
  });

  it.each([text(""), text("   "), { content: [{ type: "tool_use" }] }])(
    "throws when the reply is empty or not text",
    async (response) => {
      mockCreate.mockResolvedValue(response);
      await expect(createClaudeReply("sys", messages, "req-4")).rejects.toThrow();
    },
  );
});
