/**
 * Model selection utility for Claude API calls.
 *
 * Two tiers:
 *  "text"        — Quality-sensitive tasks (chat, personality generation).
 *                  Prod: claude-sonnet-4-6  Dev: claude-haiku-4-5-20251001
 *  "text-simple" — Simple structured tasks (validation, name lists, voice config, etc.).
 *                  Always: claude-haiku-4-5-20251001
 *
 * Avatar image generation doesn't go through here — see cloudflareImageGen.ts /
 * pollinationsImageGen.ts.
 */

export function getClaudeModel(type: "text"): string;
export function getClaudeModel(type: "text-simple"): string;
export function getClaudeModel(type: "text" | "text-simple"): string {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (type === "text") {
    // Conversational quality matters — sonnet balances capability and cost.
    // Haiku in dev to keep local iteration cheap.
    return isProd ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  }

  if (type === "text-simple") {
    // Simple structured outputs (JSON extraction, classification, short lists).
    // Haiku is sufficient and cheapest at all times.
    return "claude-haiku-4-5-20251001";
  }

  throw new Error(`Unknown model type: ${type}`);
}
