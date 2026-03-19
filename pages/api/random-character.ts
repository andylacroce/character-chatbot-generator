/**
 * API endpoint for generating random character names using Claude.
 * Maintains in-memory cache of recent names to avoid repetition.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getClaudeModel } from "../../src/utils/claudeModelSelector";
import { extractJson } from "../../src/utils/parseClaudeJson";
import anthropic from "../../src/utils/anthropicClient";

// Track all names shown to avoid repetition (resets on server restart)
const recentNames: string[] = [];
const MAX_RECENT_NAMES = 100;

function normalizeSuggestions(items: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

async function fetchSuggestions(exclusionList: string): Promise<string[]> {
  const model = getClaudeModel("text");
  const response = await anthropic.messages.create({
    model,
    system: `You are a character name generator for chatbots. Return a JSON object: { "suggestions": [...] } containing 8–10 well-known public domain character names.

Each name must come from a genuinely different culture, mythology, or tradition — no two from the same one. Span multiple continents and eras. Mix genders, roles, and archetypes freely.

Only suggest public domain characters (pre-1928 US works, or mythological/historical figures). No trademarked or modern media characters. Return ONLY valid JSON, no explanations.`,
    messages: [
      {
        role: "user",
        content: `${exclusionList}Suggest 8–10 public domain characters from diverse cultures, eras, and traditions. Each from a different one. Reply ONLY with valid JSON: { "suggestions": [...] }`,
      }
    ],
    max_tokens: 250,
    temperature: 1.0,
  });

  const raw = extractJson(response.content[0]?.type === "text" ? response.content[0].text : '{}');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    logEvent("warn", "random_character_method_not_allowed", "RandomCharacter API method not allowed", sanitizeLogMeta({ method: req.method }));
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const exclusionList = recentNames.length > 0
      ? `Do NOT suggest any of these recently used names: ${recentNames.join(", ")}.\n\n`
      : "";

    let suggestions = normalizeSuggestions(await fetchSuggestions(exclusionList));
    const fresh = suggestions.filter(s => !recentNames.includes(s));

    if (fresh.length === 0 && suggestions.length > 0) {
      suggestions = normalizeSuggestions(await fetchSuggestions(exclusionList));
    }

    const pool = suggestions.filter(s => !recentNames.includes(s));

    if (pool.length === 0) {
      logEvent("error", "random_character_failed", "Failed to generate fresh character suggestions", sanitizeLogMeta({ recentNamesCount: recentNames.length }));
      res.status(500).json({ error: "Failed to generate character suggestions" });
      return;
    }

    const chosen = pool[0];
    for (const s of pool) {
      if (!recentNames.includes(s)) recentNames.push(s);
    }
    while (recentNames.length > MAX_RECENT_NAMES) recentNames.shift();

    logEvent("info", "random_character_generated", "Random character generated", sanitizeLogMeta({
      chosen,
      suggestionsCount: pool.length,
      recentNamesCount: recentNames.length,
    }));

    res.status(200).json({ suggestions: pool, name: chosen });
  } catch (err) {
    logEvent("error", "random_character_failed", "Failed to generate random character", sanitizeLogMeta({
      error: err instanceof Error ? err.message : String(err)
    }));
    res.status(500).json({ error: "Failed to generate random character" });
  }
}
