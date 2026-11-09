/** Why a transcript request was rejected. */
export interface TranscriptProblem {
  /** Log level: expected bad input is `info`; abuse-shaped input is `warn`. */
  level: "info" | "warn";
  message: string;
  meta: Record<string, unknown>;
  error: string;
}

const MAX_MESSAGES = 10000;
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Checks a transcript request body: messages must be an array of `{ sender, text }` strings
 * (at most 10000 of them, 5MB together), and `bot`, if present, an object with string `name`
 * and `avatarUrl`. Returns the first problem found, or null when the body is acceptable.
 */
export function findTranscriptProblem(body: {
  messages?: unknown;
  bot?: unknown;
}): TranscriptProblem | null {
  const { messages, bot } = body;
  const botObject = bot as { name?: unknown; avatarUrl?: unknown } | undefined;

  if (!Array.isArray(messages)) {
    return {
      level: "info",
      message: "Messages array required",
      meta: { reason: "not_an_array" },
      error: "Messages array required",
    };
  }
  if (bot !== undefined && (typeof bot !== "object" || bot === null)) {
    return {
      level: "info",
      message: "bot must be an object",
      meta: { reason: "invalid_bot" },
      error: "bot must be an object",
    };
  }
  if (botObject && typeof botObject.name !== "string") {
    return {
      level: "info",
      message: "bot.name must be a string",
      meta: { reason: "invalid_bot_name" },
      error: "bot.name must be a string",
    };
  }
  if (botObject && typeof botObject.avatarUrl !== "string") {
    return {
      level: "info",
      message: "bot.avatarUrl must be a string",
      meta: { reason: "invalid_bot_avatar_url" },
      error: "bot.avatarUrl must be a string",
    };
  }
  for (const msg of messages) {
    if (
      typeof msg !== "object" ||
      msg === null ||
      typeof msg.sender !== "string" ||
      typeof msg.text !== "string"
    ) {
      return {
        level: "info",
        message: "Invalid message format",
        meta: { reason: "invalid_message_format" },
        error: "Invalid message format",
      };
    }
  }
  if (messages.length > MAX_MESSAGES) {
    return {
      level: "warn",
      message: "Too many messages",
      meta: { reason: "too_many_messages", count: messages.length },
      error: "Too many messages (max 10000)",
    };
  }
  const totalSize = JSON.stringify(messages).length;
  if (totalSize > MAX_PAYLOAD_BYTES) {
    return {
      level: "warn",
      message: "Transcript too large",
      meta: { reason: "too_large", totalSize },
      error: "Transcript too large (max 5MB)",
    };
  }
  return null;
}
