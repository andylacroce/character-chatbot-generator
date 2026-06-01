/**
 * Utility for downloading chat transcripts as HTML files via /api/transcript endpoint.
 * Handles browser compatibility, error handling, and content download.
 */

import type { Message } from "../types/message";
import { authenticatedFetch } from "./api";

/**
 * Downloads the chat transcript as an HTML file by calling the /api/transcript endpoint.
 *
 * Validates input, posts messages to the API, and triggers a file download via a hidden anchor element.
 *
 * @param {Array<object>} messages - The array of chat messages to include in the transcript.
 * @param {object} bot - The bot/character information including name and avatarUrl.
 * @returns {Promise<void>} Resolves when the download is triggered.
 * @throws {Error} If the transcript fetch fails or browser APIs are unavailable.
 */
export async function downloadTranscript(messages: Array<Record<string, unknown>> | Message[], bot?: { name: string; avatarUrl: string }) {
  if (!Array.isArray(messages)) {
    throw new Error("Transcript must be an array");
  }
  // Convert Message[] to Record<string, unknown>[] if needed (type coercion)
  const safeMessages: Record<string, unknown>[] = messages.map((msg) => ({ ...msg }));
  const now = new Date();
  const friendlyTime = now.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  });
  let response;
  try {
    response = await authenticatedFetch("/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: safeMessages, exportedAt: friendlyTime, bot }),
    });
  } catch (err) {
    // Network request failed
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  let htmlContent;
  try {
    htmlContent = await response.text();
  } catch (err) {
    throw new Error(`Failed to read response: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!window.URL || !window.URL.createObjectURL) {
    throw new Error("Browser does not support required APIs for downloading transcripts");
  }
  const blob = new Blob([htmlContent], { type: "text/html; charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const botSlug = bot?.name
    ? bot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)
    : "chat";
  const dateStr = now.toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "");
  const filename = `${botSlug}-transcript-${dateStr}.html`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    if (window.URL && window.URL.revokeObjectURL) window.URL.revokeObjectURL(url);
  }, typeof process !== 'undefined' && process.env.JEST_WORKER_ID ? 0 : 100);
}
