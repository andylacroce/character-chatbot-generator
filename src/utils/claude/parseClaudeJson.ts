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
  // An unclosed fence means the reply was cut off; still drop the opener so the parse error
  // names the real problem (truncated JSON) instead of "Unexpected token '`'".
  return text.slice(contentStart, closingFence === -1 ? undefined : closingFence).trim();
}
