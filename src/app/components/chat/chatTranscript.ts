import { downloadTranscript } from "../../../utils/chat/downloadTranscript";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import type { Message } from "../../../types/message";
import type { Bot } from "../character/BotCreator";

/** Downloads the chat as a transcript file, logging the outcome and alerting on failure. */
export async function downloadChatTranscript(
  messages: Message[],
  bot: Bot,
  userName?: string,
): Promise<void> {
  try {
    await downloadTranscript(messages, { name: bot.name, avatarUrl: bot.avatarUrl }, userName);
    if (typeof window !== "undefined") {
      logEvent(
        "info",
        "chat_transcript_downloaded",
        "Transcript downloaded successfully",
        sanitizeLogMeta({
          botName: bot.name,
          messageCount: messages.length,
        }),
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    if (typeof window !== "undefined") {
      logEvent(
        "error",
        "chat_transcript_download_failed",
        "Failed to download transcript",
        sanitizeLogMeta({
          botName: bot.name,
          error: errorMessage,
          messageCount: messages.length,
        }),
      );
    }
    alert(`Failed to open transcript: ${errorMessage}`);
  }
}
