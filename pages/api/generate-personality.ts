// =============================
// pages/api/generate-personality.ts
// Next.js API route for generating a character personality prompt using OpenAI.
// Accepts POST requests with a character name and returns a personality string.
// =============================

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";

/**
 * Next.js API route handler for generating a character personality prompt using OpenAI.
 * Accepts POST requests with a character name and returns a personality string.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const { name: originalName } = req.body;
  if (!originalName) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  logEvent("info", "personality_prompt_generated", "Personality prompt generated", sanitizeLogMeta({
    name: originalName
  }));
  const concisePrompt = `You are ${originalName}. Always respond in character, using your unique style, knowledge, and quirks. Use your internal knowledge. Never break character or mention being an AI.`;
  res.status(200).json({ personality: concisePrompt, correctedName: originalName });
  return;
}
