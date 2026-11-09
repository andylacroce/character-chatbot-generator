import { findTranscriptProblem } from "../../src/utils/chat/transcriptRequest";

const msg = { sender: "User", text: "hi" };
const bot = { name: "Ada", avatarUrl: "a.png" };

describe("findTranscriptProblem", () => {
  it("accepts messages with or without a bot", () => {
    expect(findTranscriptProblem({ messages: [msg] })).toBeNull();
    expect(findTranscriptProblem({ messages: [msg], bot })).toBeNull();
    expect(findTranscriptProblem({ messages: [] })).toBeNull();
  });

  it("requires a messages array", () => {
    expect(findTranscriptProblem({ messages: "nope" })).toMatchObject({
      level: "info",
      error: "Messages array required",
      meta: { reason: "not_an_array" },
    });
    expect(findTranscriptProblem({})?.error).toBe("Messages array required");
  });

  it.each([
    ["bot is not an object", "text", "bot must be an object", "invalid_bot"],
    ["bot is null", null, "bot must be an object", "invalid_bot"],
    [
      "bot.name is not a string",
      { avatarUrl: "a" },
      "bot.name must be a string",
      "invalid_bot_name",
    ],
    [
      "bot.avatarUrl is not a string",
      { name: "Ada" },
      "bot.avatarUrl must be a string",
      "invalid_bot_avatar_url",
    ],
  ])("rejects when %s", (_label, badBot, error, reason) => {
    expect(findTranscriptProblem({ messages: [msg], bot: badBot })).toMatchObject({
      level: "info",
      error,
      meta: { reason },
    });
  });

  it.each([[null], ["text"], [{ sender: 1, text: "x" }], [{ sender: "User" }]])(
    "rejects a malformed message (%p)",
    (bad) => {
      expect(findTranscriptProblem({ messages: [msg, bad] })).toMatchObject({
        error: "Invalid message format",
        meta: { reason: "invalid_message_format" },
      });
    },
  );

  it("warns about more than 10000 messages", () => {
    const problem = findTranscriptProblem({ messages: new Array(10001).fill(msg) });
    expect(problem).toMatchObject({
      level: "warn",
      error: "Too many messages (max 10000)",
      meta: { reason: "too_many_messages", count: 10001 },
    });
  });

  it("warns about a payload over 5MB", () => {
    const problem = findTranscriptProblem({
      messages: [{ sender: "User", text: "x".repeat(5 * 1024 * 1024 + 1) }],
    });
    expect(problem).toMatchObject({ level: "warn", error: "Transcript too large (max 5MB)" });
  });
});
