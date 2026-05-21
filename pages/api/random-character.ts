/**
 * API endpoint for picking a random public-domain character name.
 * Uses a static in-process list; no LLM call required.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import characterNames from "../../src/data/characterNames";

// Track names shown this server session to avoid repetition
const recentNames: string[] = [];
const MAX_RECENT_NAMES = 100;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    logEvent("warn", "random_character_method_not_allowed", "RandomCharacter API method not allowed", sanitizeLogMeta({ method: req.method }));
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const available = characterNames.filter(name => !recentNames.includes(name));

  if (available.length === 0) {
    // All names have been shown — reset and use the full list
    recentNames.length = 0;
    available.push(...characterNames);
  }

  const chosen = available[Math.floor(Math.random() * available.length)];
  recentNames.push(chosen);
  while (recentNames.length > MAX_RECENT_NAMES) recentNames.shift();

  logEvent("info", "random_character_generated", "Random character generated", sanitizeLogMeta({
    chosen,
    availableCount: available.length,
    recentNamesCount: recentNames.length,
  }));

  res.status(200).json({ name: chosen });
}
