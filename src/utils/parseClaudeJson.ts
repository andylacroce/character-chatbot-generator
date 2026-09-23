/**
 * Strips markdown code fences from a Claude response before JSON parsing.
 * Claude sometimes wraps JSON responses in ```json ... ``` blocks.
 */
export function extractJson(text: string): string {
  const openingFence = text.indexOf("```");
  if (openingFence === -1) return text.trim();

  let contentStart = openingFence + 3;
  if (text.startsWith("json", contentStart)) contentStart += 4;

  const closingFence = text.indexOf("```", contentStart);
  return closingFence === -1 ? text.trim() : text.slice(contentStart, closingFence).trim();
}
