/**
 * Conversation summarization utility for the chat API.
 * Uses Claude Haiku to produce a concise summary of older messages so the
 * context window stays manageable without losing narrative continuity.
 */

import Anthropic from "@anthropic-ai/sdk";
import logger from "../logger";
import { getClaudeModel } from "../claude/claudeModelSelector";
import { thinkingFor } from "../claude/claudeThinking";

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

/**
 * Summarizes a set of conversation messages into a short paragraph. When `priorSummary` is
 * given (the rolling checkpoint summary on `bots`, see app/api/chat/route.ts), it's folded in as
 * prior context so the new summary compounds the old one instead of discarding everything
 * summarized before — each call only ever has to summarize the messages since the last
 * checkpoint, not the conversation from scratch.
 * Falls back to a generic placeholder on error so the calling code never
 * has to handle a rejection.
 */
export async function summarizeConversation(
  anthropic: Anthropic,
  messages: ClaudeMessage[],
  botName: string,
  priorSummary?: string | null,
): Promise<string> {
  try {
    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : botName}: ${m.content}`)
      .join("\n");

    const userContent = priorSummary
      ? `Summary of the conversation so far:\n${priorSummary}\n\nNewer messages to fold in:\n${conversationText}`
      : conversationText;

    const summaryResponse = await anthropic.messages.create({
      model: getClaudeModel("text-simple"),
      thinking: thinkingFor("text-simple"),
      system:
        "Summarize this conversation concisely, capturing key topics, emotional tone, and important context. If given an existing summary plus newer messages, produce one updated summary covering both. Keep it under 150 words.",
      messages: [{ role: "user", content: userContent }],
      max_tokens: 200,
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
export function buildClaudeMessages(history: string[], userMessage: string): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];
  for (const entry of history) {
    // Anthropic rejects empty message content, so a blank turn is dropped rather than 500ing the call.
    if (entry.startsWith("User: ") && entry.slice(6).trim()) {
      messages.push({ role: "user", content: entry.slice(6) });
    } else if (entry.startsWith("Bot: ") && entry.slice(5).trim()) {
      messages.push({ role: "assistant", content: entry.slice(5) });
    }
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}
