/**
 * Strips markdown code fences from a Claude response before JSON parsing.
 * Claude sometimes wraps JSON responses in ```json ... ``` blocks.
 */
export function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1].trim() : text.trim();
}
