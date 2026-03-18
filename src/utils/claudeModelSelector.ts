/**
 * Model selection utility for Claude API and Google Imagen calls.
 *
 * Three tiers:
 *  "text"        — Quality-sensitive tasks (chat, personality generation).
 *                  Prod: claude-sonnet-4-6  Dev: claude-haiku-4-5-20251001
 *  "text-simple" — Simple structured tasks (validation, name lists, voice config, etc.).
 *                  Always: claude-haiku-4-5-20251001
 *  "image"       — Avatar generation via Vertex AI Imagen.
 *                  Always: imagen-3.0-fast-generate-001
 */

export function getClaudeModel(type: "text"): string;
export function getClaudeModel(type: "text-simple"): string;
export function getClaudeModel(type: "image"): { primary: string };
export function getClaudeModel(type: "text" | "text-simple" | "image"): string | { primary: string } {
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

    if (type === "image") {
        // Imagen 3 Fast: ~50% cheaper than Imagen 3 standard with negligible
        // quality difference for character portrait generation.
        return { primary: "imagen-3.0-fast-generate-001" };
    }

    throw new Error(`Unknown model type: ${type}`);
}
