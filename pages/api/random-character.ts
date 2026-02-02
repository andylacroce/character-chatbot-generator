/**
 * API endpoint for generating random character names using OpenAI.
 * Maintains in-memory cache of recent names to avoid repetition.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getOpenAIModel } from "../../src/utils/openaiModelSelector";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Track recently generated names in memory to avoid repetition (resets on server restart)
const recentNames: string[] = [];
const MAX_RECENT_NAMES = 50;

const MIN_SUGGESTIONS = 3;
const MAX_SUGGESTIONS = 5;

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

/**
 * Next.js API route handler for generating a random character name using OpenAI.
 * Tracks recently generated names to improve variety.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
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
    const model = getOpenAIModel("text");

    // Build exclusion list from recent names for better name variety
    const exclusionList = recentNames.length > 0 
      ? `Do NOT suggest any of these recently used names: ${recentNames.join(", ")}. `
      : "";

    // Ask the model to return a JSON object with a "suggestions" array of 3-5 well-known public-domain characters.
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a creative name generator for chatbots. Your goal is to provide TRULY UNIQUE and VARIED public domain character suggestions, pulling from all time periods and cultures. Return a JSON object with a single field "suggestions" containing 3 to 5 WELL-KNOWN public domain character names (no explanations). Each call should explore DIFFERENT categories and time periods—do NOT repeat common patterns.

CATEGORY DISTRIBUTION REQUIREMENT:
- Aim for exactly one character from each distinct category: mythology (any culture), classic literature, historical figures, folklore/legends, and early science/arts
- If only returning 3-4 suggestions, pick the most interesting mix of different categories
- AVOID clustering similar types (e.g., 2 philosophers, 2 warriors, 2 literary detectives)

IMPORTANT GUARDRAILS:
- Only suggest characters that are firmly in the public domain (typically pre-1928 for US works)
- AVOID any character from modern media, movies, TV shows, video games, or comics created after 1928
- AVOID characters that are trademarked (e.g., Mickey Mouse, Superman, Harry Potter, Mario, Spider-Man)
- AVOID the most predictable/popular choices unless explicitly constrained
- Include lesser-known but still well-recognizable figures to increase variety
- AVOID obscure or extremely local folk characters; suggestions must be widely recognizable and well-known
- Good variety examples: Cleopatra (history), Anansi (African mythology), Don Quixote (literature), Merlin (folklore), Ada Lovelace (early science)

Return ONLY valid JSON, for example: { "suggestions": ["Sherlock Holmes", "Robin Hood"] }`
        },
        {
          role: "user",
          content: `${exclusionList}Suggest 3 to 5 well-known public domain character names from DIFFERENT categories and time periods as a JSON object with a "suggestions" array. Be creative and exploratory—avoid default/predictable answers. Ensure each suggestion comes from a distinct category (mythology, literature, history, folklore, science/arts). Reply ONLY with valid JSON.`
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let suggestions: string[] = [];
    try {
      const parsed = typeof raw === 'object' ? raw : JSON.parse(raw);
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s: unknown) => String(s).trim()).filter(Boolean) : [];
    } catch {
      suggestions = [];
    }

    const normalized = normalizeSuggestions(suggestions ?? []);
    const filtered = normalized.filter(item => !recentNames.includes(item));
    const preferred = filtered.length >= MIN_SUGGESTIONS ? filtered : normalized;
    const limited = preferred.slice(0, MAX_SUGGESTIONS);

    // Fallback list when the model fails to return suggestions
    if (limited.length === 0) {
      suggestions = ["Sherlock Holmes", "Robin Hood", "Hercules"].slice(0, MAX_SUGGESTIONS);
    } else {
      suggestions = limited;
    }

    // Choose a suggestion that hasn't been used recently when possible
    const chosen = suggestions.find(s => !recentNames.includes(s)) || suggestions[0] || "Sherlock Holmes";

    // Track generated name and maintain max recent names list
    if (!recentNames.includes(chosen)) {
      recentNames.push(chosen);
      if (recentNames.length > MAX_RECENT_NAMES) {
        recentNames.shift(); // Remove oldest name when list reaches max size
      }
    }

    logEvent("info", "random_character_generated", "Random character generated", sanitizeLogMeta({ 
      chosen,
      suggestionsCount: suggestions.length,
      recentNamesCount: recentNames.length
    }));

    // Return both suggestions and the chosen name for backwards compatibility
    res.status(200).json({ suggestions, name: chosen });
  } catch (err) {
    logEvent("error", "random_character_failed", "Failed to generate random character", sanitizeLogMeta({
      error: err instanceof Error ? err.message : String(err)
    }));
    // Return default fallback on any error - suggestions + chosen name
    res.status(200).json({ suggestions: ["Sherlock Holmes"], name: "Sherlock Holmes" });
  }
}
