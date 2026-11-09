import {
  MAX_HISTORY_ENTRIES,
  MAX_MESSAGE_LENGTH,
  MAX_PERSONALITY_LENGTH,
  findChatInputProblem,
} from "../../src/utils/chat/chatRequest";

const ok = {
  userMessage: "hello",
  personality: "wise",
  conversationHistory: [],
  voiceConfig: { name: "v" },
};

describe("findChatInputProblem", () => {
  it("accepts a normal request", () => {
    expect(findChatInputProblem(ok)).toBeNull();
  });

  it("accepts a request with no personality (the server supplies one)", () => {
    expect(findChatInputProblem({ ...ok, personality: undefined })).toBeNull();
  });

  it.each([
    ["message", { userMessage: "x".repeat(MAX_MESSAGE_LENGTH + 1) }],
    ["personality", { personality: "x".repeat(MAX_PERSONALITY_LENGTH + 1) }],
    ["history", { conversationHistory: new Array(MAX_HISTORY_ENTRIES + 1).fill("User: hi") }],
  ])("rejects an oversized %s", (_label, overrides) => {
    expect(findChatInputProblem({ ...ok, ...overrides })).toEqual({
      event: "chat_bad_request_too_large",
      message: "Chat input too large",
      error: "Message, personality, or history is too long",
    });
  });

  it("accepts input exactly at each ceiling", () => {
    expect(
      findChatInputProblem({
        ...ok,
        userMessage: "x".repeat(MAX_MESSAGE_LENGTH),
        personality: "x".repeat(MAX_PERSONALITY_LENGTH),
        conversationHistory: new Array(MAX_HISTORY_ENTRIES).fill("User: hi"),
      }),
    ).toBeNull();
  });

  it.each([undefined, null, ""])("requires a message (got %p)", (userMessage) => {
    expect(findChatInputProblem({ ...ok, userMessage })?.event).toBe("chat_bad_request_message");
  });

  it.each([undefined, null, "voice", 5])(
    "requires a voice config object (got %p)",
    (voiceConfig) => {
      expect(findChatInputProblem({ ...ok, voiceConfig })).toEqual({
        event: "chat_bad_request_voice_config",
        message: "Voice config is required",
        error: "Voice config is required",
      });
    },
  );

  it("reports the size problem before a missing voice config", () => {
    const problem = findChatInputProblem({
      ...ok,
      userMessage: "x".repeat(MAX_MESSAGE_LENGTH + 1),
      voiceConfig: undefined,
    });
    expect(problem?.event).toBe("chat_bad_request_too_large");
  });
});
