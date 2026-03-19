/**
 * Conversation summarization utility for the chat API.
 * Uses Claude Haiku to produce a concise summary of older messages so the
 * context window stays manageable without losing narrative continuity.
 */

import Anthropic from "@anthropic-ai/sdk";
import logger from "./logger";
import { getClaudeModel } from "./claudeModelSelector";

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

/**
 * Summarizes a set of conversation messages into a short paragraph.
 * Falls back to a generic placeholder on error so the calling code never
 * has to handle a rejection.
 */
export async function summarizeConversation(
  anthropic: Anthropic,
  messages: ClaudeMessage[],
  botName: string,
): Promise<string> {
  try {
    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : botName}: ${m.content}`)
      .join("\n");

    const summaryResponse = await anthropic.messages.create({
      model: getClaudeModel("text-simple"),
      system:
        "Summarize this conversation concisely, capturing key topics, emotional tone, and important context. Keep it under 150 words.",
      messages: [{ role: "user", content: conversationText }],
      max_tokens: 200,
      temperature: 0.3,
    });

    return summaryResponse.content[0]?.type === "text"
      ? summaryResponse.content[0].text.trim()
      : "Previous conversation history.";
  } catch (error) {
    logger.error("Failed to summarize conversation:", { error });
    return "Previous conversation covered various topics.";
  }
}

/**
 * Builds the Claude message array from raw conversation history strings and a
 * new user message.  The system prompt is kept separate (Claude requires it as
 * a top-level param).
 */
export function buildClaudeMessages(
  history: string[],
  userMessage: string,
): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];
  for (const entry of history) {
    if (entry.startsWith("User: ")) {
      messages.push({ role: "user", content: entry.replace(/^User: /, "") });
    } else if (entry.startsWith("Bot: ")) {
      messages.push({
        role: "assistant",
        content: entry.replace(/^Bot: /, ""),
      });
    }
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}
