/** Input ceilings: generous for real use, but bound what one request can make Claude read. */
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_PERSONALITY_LENGTH = 20000;
export const MAX_HISTORY_ENTRIES = 200;

/** Why a chat request was rejected: the log event, its message, and the client-facing error. */
export interface ChatInputProblem {
  event: string;
  message: string;
  error: string;
}

/**
 * Checks a chat request's body before any Claude work. Returns the first problem found
 * (too large, no message, no voice config) or null when the request is acceptable.
 */
export function findChatInputProblem(input: {
  userMessage: unknown;
  personality: unknown;
  conversationHistory: unknown;
  voiceConfig: unknown;
}): ChatInputProblem | null {
  const { userMessage, personality, conversationHistory, voiceConfig } = input;
  if (
    typeof userMessage === "string" &&
    (userMessage.length > MAX_MESSAGE_LENGTH ||
      (typeof personality === "string" && personality.length > MAX_PERSONALITY_LENGTH) ||
      (Array.isArray(conversationHistory) && conversationHistory.length > MAX_HISTORY_ENTRIES))
  ) {
    return {
      event: "chat_bad_request_too_large",
      message: "Chat input too large",
      error: "Message, personality, or history is too long",
    };
  }
  if (!userMessage) {
    return {
      event: "chat_bad_request_message",
      message: "Message is required",
      error: "Message is required",
    };
  }
  if (!voiceConfig || typeof voiceConfig !== "object") {
    return {
      event: "chat_bad_request_voice_config",
      message: "Voice config is required",
      error: "Voice config is required",
    };
  }
  return null;
}
