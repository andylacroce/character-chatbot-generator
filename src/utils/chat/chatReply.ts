import anthropic from "../claude/anthropicClient";
import { getClaudeModel } from "../claude/claudeModelSelector";
import { thinkingFor } from "../claude/claudeThinking";
import { logEvent, sanitizeLogMeta } from "../logger";
import type { SseSend } from "../sse";
import { isClaudeResponse } from "./chatReplyFormatting";
import type { ClaudeMessage } from "./conversationSummarizer";

/** How long a non-streamed reply may take before the request gives up. */
const REPLY_TIMEOUT_MS = 20000;

/** The Claude call settings every chat reply shares. */
function replyParams(system: string, messages: ClaudeMessage[]) {
  return {
    model: getClaudeModel("text"),
    thinking: thinkingFor("text"),
    system,
    messages,
    max_tokens: 500,
    stop_sequences: ["User:", "Bot:"],
  };
}

/**
 * Streams Claude's reply to the client as `{ chunk, done: false }` SSE frames and returns the
 * full text (empty if Claude said nothing). The caller sends the final frame, since it needs
 * the audio URL that can only be made once the whole reply exists. Throws if the stream fails.
 */
export async function streamClaudeReply(
  send: SseSend,
  system: string,
  messages: ClaudeMessage[],
): Promise<string> {
  const streamResponse = anthropic.messages.stream(replyParams(system, messages));
  let botReply = "";
  for await (const chunk of streamResponse) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      const content = chunk.delta.text;
      if (content) {
        botReply += content;
        send({ chunk: content, done: false });
      }
    }
  }
  return botReply;
}

/**
 * Gets Claude's reply in one call. Returns the trimmed text, or null if Claude didn't answer
 * within 20 seconds (logged as `chat_timeout`). Throws on an invalid or empty response.
 */
export async function createClaudeReply(
  system: string,
  messages: ClaudeMessage[],
  requestId: string | string[],
): Promise<string | null> {
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ timeout: true }), REPLY_TIMEOUT_MS),
  );
  const result = await Promise.race([
    anthropic.messages.create(replyParams(system, messages)),
    timeout,
  ]);

  if (result && typeof result === "object" && "timeout" in result) {
    logEvent(
      "warn",
      "chat_timeout",
      "Request timed out waiting for Claude",
      sanitizeLogMeta({ requestId }),
    );
    return null;
  }
  if (!isClaudeResponse(result)) {
    logEvent(
      "error",
      "chat_invalid_claude_response",
      "Invalid response shape from Claude",
      sanitizeLogMeta({ requestId }),
    );
    throw new Error("Invalid response from Claude");
  }
  const botReply =
    result.content[0]?.type === "text"
      ? (result.content[0] as { type: "text"; text: string }).text.trim()
      : "";

  if (!botReply || botReply.trim() === "") {
    logEvent(
      "error",
      "chat_empty_bot_response",
      "Generated bot response was empty",
      sanitizeLogMeta({ requestId }),
    );
    throw new Error("Generated bot response is empty.");
  }
  return botReply;
}
