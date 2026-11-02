/**
 * Model selection utility for Claude API calls.
 *
 * Two tiers:
 *  "text"        — Quality-sensitive tasks (chat, game replies).
 *                  Prod: claude-sonnet-5-5  Dev: claude-haiku-5-5
 *  "text-simple" — Simple structured tasks (validation, name lists, voice config, etc.).
 *                  Always: claude-haiku-5-5
 *
 * Both 5.5 models think by default, which would eat the small `max_tokens` budgets and add
 * latency; call sites pass `thinking: thinkingFor(tier)` (see claudeThinking.ts).
 *
 * Avatar image generation doesn't go through here — see cloudflareImageGen.ts /
 * pollinationsImageGen.ts.
 */

/** Returns the Claude model id to use for a given call-site tier (see module doc above). */
export function getClaudeModel(type: "text"): string;
export function getClaudeModel(type: "text-simple"): string;
export function getClaudeModel(type: "text" | "text-simple"): string {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (type === "text") {
    // Conversational quality matters — sonnet balances capability and cost.
    // Haiku in dev to keep local iteration cheap.
    return isProd ? "claude-sonnet-5-5" : "claude-haiku-5-5";
  }

  if (type === "text-simple") {
    // Simple structured outputs (JSON extraction, classification, short lists).
    // Haiku is sufficient and cheapest at all times.
    return "claude-haiku-5-5";
  }

  throw new Error(`Unknown model type: ${type}`);
}
