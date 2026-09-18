/**
 * Claude reply post-processing shared by pages/api/chat.ts and the guessing game's
 * pages/api/game/message.ts (via src/utils/gameReply.ts) — extracted so both call sites
 * apply identical cleanup instead of copy-pasting it.
 */

/**
 * Checks if the given object is a valid Claude messages response.
 */
export function isClaudeResponse(
  obj: unknown,
): obj is { content: { type: string; text?: string }[] } {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "content" in obj &&
    Array.isArray((obj as { content: unknown }).content)
  );
}

/**
 * Removes roleplay action emotes (*action text*) from a response.
 * Characters should speak in dialogue/prose only, not stage directions.
 */
export function stripActionEmotes(response: string): string {
  // Remove *...* patterns (action emotes) and clean up extra whitespace
  return response
    .replace(/\*[^*]+\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Gracefully wraps a response that might be truncated by adding an appropriate ending.
 */
export function gracefullyWrapResponse(response: string): string {
  if (!response || response.length === 0) return response;

  const trimmed = response.trimEnd();

  // If already ends with proper punctuation, return as-is
  if (/[.!?;:]\s*$/.test(trimmed)) {
    return trimmed;
  }

  // If ends mid-sentence with comma, add more natural completion
  if (trimmed.endsWith(",")) {
    return trimmed.slice(0, -1) + ".";
  }

  // If ends mid-word or incomplete, try to find last complete sentence
  const lastPeriod = trimmed.lastIndexOf(".");
  const lastExclamation = trimmed.lastIndexOf("!");
  const lastQuestion = trimmed.lastIndexOf("?");
  const lastSemicolon = trimmed.lastIndexOf(";");

  const lastPunctuation = Math.max(lastPeriod, lastExclamation, lastQuestion, lastSemicolon);

  // If we found proper punctuation before the end, use up to that point
  if (lastPunctuation > trimmed.length * 0.6) {
    return trimmed.substring(0, lastPunctuation + 1);
  }

  // Otherwise, try to find last complete word/phrase and end it gracefully
  const lastSpace = trimmed.lastIndexOf(" ", trimmed.length - 1);
  if (lastSpace > 0 && trimmed.length - lastSpace > 10) {
    return trimmed.substring(0, lastSpace) + ".";
  }

  // Last resort: just add a period
  return trimmed + ".";
}
