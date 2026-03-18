/**
 * API endpoint for generating random character names using Claude.
 * Maintains in-memory cache of recent names to avoid repetition.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getClaudeModel } from "../../src/utils/claudeModelSelector";
import { extractJson } from "../../src/utils/parseClaudeJson";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Track all names shown to avoid repetition (resets on server restart)
const recentNames: string[] = [];
const MAX_RECENT_NAMES = 100;

function normalizeSuggestions(items: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

async function fetchSuggestions(exclusionList: string): Promise<string[]> {
  const model = getClaudeModel("text-simple");
  const response = await anthropic.messages.create({
    model,
    system: `You are a creative name generator for chatbots. Your goal is to provide TRULY UNIQUE and VARIED public domain character suggestions, pulling from all time periods and cultures. Return a JSON object with a single field "suggestions" containing 8 to 10 WELL-KNOWN public domain character names (no explanations). Each call should explore DIFFERENT categories and time periods—do NOT repeat common patterns.

CATEGORY DISTRIBUTION REQUIREMENT:
- Spread across distinct categories: mythology (any culture), classic literature, historical figures, folklore/legends, early science/arts, ancient heroes, religious texts, epic poetry
- AVOID clustering similar types (e.g., 2 philosophers, 2 warriors, 2 literary detectives)

IMPORTANT GUARDRAILS:
- Only suggest characters that are firmly in the public domain (typically pre-1928 for US works)
- AVOID any character from modern media, movies, TV shows, video games, or comics created after 1928
- AVOID characters that are trademarked (e.g., Mickey Mouse, Superman, Harry Potter, Mario, Spider-Man)
- AVOID the most predictable/popular choices unless explicitly constrained
- Include lesser-known but still well-recognizable figures to increase variety
- AVOID obscure or extremely local folk characters; suggestions must be widely recognizable

Return ONLY valid JSON, for example: { "suggestions": ["Cleopatra", "Anansi", "Don Quixote", "Merlin", "Ada Lovelace"] }`,
    messages: [
      {
        role: "user",
        content: `${exclusionList}Suggest 8 to 10 well-known public domain character names from DIFFERENT categories and time periods as a JSON object with a "suggestions" array. Be creative and exploratory—avoid default/predictable answers. Ensure each suggestion comes from a distinct category. Reply ONLY with valid JSON.`
      }
    ],
    max_tokens: 200,
    temperature: 0.9,
  });

  const raw = extractJson(response.content[0]?.type === "text" ? response.content[0].text : '{}');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
}

/**
 * Next.js API route handler for generating a random character name using Claude.
 * Tracks all previously shown names to prevent repetition.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    logEvent("warn", "random_character_method_not_allowed", "RandomCharacter API method not allowed", sanitizeLogMeta({
      method: req.method
    }));
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const exclusionList = recentNames.length > 0
      ? `Do NOT suggest any of these recently used names: ${recentNames.join(", ")}. `
      : "";

    let suggestions = normalizeSuggestions(await fetchSuggestions(exclusionList));
    const fresh = suggestions.filter(s => !recentNames.includes(s));

    // If Claude returned only names we've already shown, retry once with same exclusion list
    if (fresh.length === 0 && suggestions.length > 0) {
      suggestions = normalizeSuggestions(await fetchSuggestions(exclusionList));
    }

    const pool = suggestions.filter(s => !recentNames.includes(s));

    if (pool.length === 0) {
      logEvent("error", "random_character_failed", "Failed to generate fresh character suggestions", sanitizeLogMeta({
        recentNamesCount: recentNames.length
      }));
      res.status(500).json({ error: "Failed to generate character suggestions" });
      return;
    }

    const chosen = pool[0];

    // Track all suggestions shown to maximise non-repetition across future calls
    for (const s of pool) {
      if (!recentNames.includes(s)) {
        recentNames.push(s);
      }
    }
    while (recentNames.length > MAX_RECENT_NAMES) {
      recentNames.shift();
    }

    logEvent("info", "random_character_generated", "Random character generated", sanitizeLogMeta({
      chosen,
      suggestionsCount: pool.length,
      recentNamesCount: recentNames.length
    }));

    res.status(200).json({ suggestions: pool, name: chosen });
  } catch (err) {
    logEvent("error", "random_character_failed", "Failed to generate random character", sanitizeLogMeta({
      error: err instanceof Error ? err.message : String(err)
    }));
    res.status(500).json({ error: "Failed to generate random character" });
  }
}
