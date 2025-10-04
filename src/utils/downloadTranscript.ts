// =============================
// downloadTranscript.ts
// Utility for opening the chat transcript as HTML in a new browser tab via the /api/transcript endpoint.
// Handles browser compatibility, error handling, and content display.
// =============================

import type { Message } from "../types/message";
import { authenticatedFetch } from "./api";

/**
 * Opens the chat transcript as HTML in a new browser tab by calling the /api/transcript endpoint.
 *
 * Validates input, posts messages to the API, and opens the HTML transcript in a new tab.
 *
 * @param {Array<object>} messages - The array of chat messages to include in the transcript.
 * @param {object} bot - The bot/character information including name and avatarUrl.
 * @returns {Promise<void>} Resolves when the new tab is opened.
 * @throws {Error} If the transcript fetch fails or browser APIs are unavailable.
 */
export async function downloadTranscript(messages: Array<Record<string, unknown>> | Message[], bot?: { name: string; avatarUrl: string }) {
  if (!Array.isArray(messages)) {
    throw new Error("Transcript must be an array");
  }
  // If messages are Message[], convert to Record<string, unknown>[]
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
    // Network error
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
    throw new Error("Browser does not support required APIs for opening new tabs");
  }
  const blob = new Blob([htmlContent], { type: "text/html; charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const newWindow = window.open(url, "_blank");
  if (!newWindow) {
    // Clean up the blob URL since we can't use it
    window.URL.revokeObjectURL(url);
    throw new Error("Failed to open new tab - popup blocker may be active or browser security settings prevent it");
  }
  setTimeout(() => {
    if (window.URL && window.URL.revokeObjectURL) window.URL.revokeObjectURL(url);
  }, typeof process !== 'undefined' && process.env.JEST_WORKER_ID ? 0 : 100);
}
