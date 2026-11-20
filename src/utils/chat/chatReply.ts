import anthropic from "../claude/anthropicClient";
import { throwIfRefused } from "../claude/refusal";
import { recordTextUsage, textCallSettings } from "../claude/spendGuard";
import { logEvent, sanitizeLogMeta } from "../logger";
import type { SseSend } from "../sse";
import { isClaudeResponse } from "./chatReplyFormatting";
import type { ClaudeMessage } from "./conversationSummarizer";

/** How long a non-streamed reply may take before the request gives up. */
const REPLY_TIMEOUT_MS = 20000;

/** The Claude call settings every chat reply shares. */
async function replyParams(system: string, messages: ClaudeMessage[]) {
  return {
    ...(await textCallSettings()),
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
  const streamResponse = anthropic.messages.stream(await replyParams(system, messages));
  let botReply = "";
  const usage = { input_tokens: 0, output_tokens: 0 };
  let ending: Parameters<typeof throwIfRefused>[0] = {};
  for await (const chunk of streamResponse) {
    if (chunk.type === "message_start") usage.input_tokens = chunk.message.usage.input_tokens;
    if (chunk.type === "message_delta") {
      usage.output_tokens = chunk.usage.output_tokens;
      ending = chunk.delta;
    }
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      const content = chunk.delta.text;
      if (content) {
        botReply += content;
        send({ chunk: content, done: false });
      }
    }
  }
  await recordTextUsage(usage);
  throwIfRefused(ending);
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
  const params = await replyParams(system, messages);
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ timeout: true }), REPLY_TIMEOUT_MS),
  );
  // Usage is recorded inside the call's own promise so a reply that outlives the timeout (still billed) is counted too.
  const call = anthropic.messages.create(params).then(async (response) => {
    await recordTextUsage(response.usage);
    return response;
  });
  const result = await Promise.race([call, timeout]);

  if (result && typeof result === "object" && "timeout" in result) {
    logEvent(
      "warn",
      "chat_timeout",
      "Request timed out waiting for Claude",
      sanitizeLogMeta({ requestId }),
    );
    return null;
  }
  // Before the shape check: a refusal's content is empty and would read as an invalid response.
  throwIfRefused(result as Parameters<typeof throwIfRefused>[0]);
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
