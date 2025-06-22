// =============================
// pages/api/random-character.ts
// Next.js API route for generating or selecting a random character name.
// Uses OpenAI or static list for suggestions, logs results for analytics.
// =============================

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import logger from "../../src/utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function logRandomCharacter(name: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/log-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: '[Randomizer]',
        text: `Random character: ${name}`,
        sessionId: 'randomizer',
        sessionDatetime: new Date().toISOString(),
      })
    });
  } catch {
    // Ignore logging errors
  }
}

/**
 * Next.js API route handler for generating or selecting a random character name.
 * Uses OpenAI for suggestions, falls back to 'gandalf' if OpenAI fails.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Aggressive anti-caching headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('ETag', Math.random().toString(36).slice(2)); // Random ETag to defeat cache

  if (req.method !== "GET") {
    logger.info(`[RandomCharacter API] 405 Method Not Allowed for ${req.method}`);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Accept exclusions from query param (future extensibility)
  let exclude: string[] = [];
  if (typeof req.query.exclude === "string") {
    exclude = req.query.exclude.split(",").map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(req.query.exclude)) {
    exclude = req.query.exclude.flatMap(s => s.split(",").map(x => x.trim())).filter(Boolean);
  }

  let tries = 0;
  let name: string | undefined = undefined;
  let lastError: unknown = null;
  while (tries < 3) {
    try {
      const exclusionStr = exclude.map(n => `"${n}"`).join(", ");
      const prompt = `### INSTRUCTIONS
You are an expert in world history, literature, pop culture, and media. Your task is to suggest the name of a real, well-known character from history, literature, film, TV, comics, or pop culture. Follow these rules:
- Reply ONLY with the character's name. Do not include any description, explanation, or extra text.
- Do NOT pick any of the following: ${exclusionStr}.
- Do NOT pick any character that is too similar to those listed above, or that you have suggested recently.
- Each time, pick a character from a different genre, time period, country, or background than those recently suggested.
- Vary gender, culture, time period, and genre.
- Avoid repeats, near-duplicates, or generic names.
- Think carefully and take your time to select a truly unique and interesting character.
- Output format: Only the character's name, nothing else.
### END INSTRUCTIONS`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant. Always pick a different, random character each time. Avoid repeating any character you've suggested recently. Vary genres, time periods, and backgrounds. Prioritize creativity, diversity, and randomness in your choices." },
          { role: "user", content: prompt },
        ],
        max_tokens: 32,
        temperature: 1.7,
      });
      name = completion.choices[0]?.message?.content?.trim().replace(/^"|"$/g, "");
      // Validate the name: must be 2+ chars, not just numbers, not contain forbidden chars, not look like junk
      const isValidName = (n: string | undefined) => {
        if (!n) return false;
        if (n.length < 2) return false;
        // Restrict to printable ASCII, letters, numbers, spaces, hyphens, apostrophes, and periods
        if (/[^A-Za-z0-9\s\-'.]/.test(n)) return false; // no weird symbols or non-latin
        if (/\d{3,}/.test(n)) return false; // not just numbers
        if (/^[A-Za-z]{1,2}$/.test(n)) return false; // not just a single letter or two
        if (/(unknown|n[\\/]?a|none|null|character|random|test)/i.test(n.trim())) return false;
        if (exclude.some(e => n.toLowerCase() === e.toLowerCase())) return false;
        // Avoid near-duplicates (case-insensitive, ignore spaces)
        if (exclude.some(e => n.replace(/\s+/g, '').toLowerCase() === e.replace(/\s+/g, '').toLowerCase())) return false;
        return true;
      };
      if (!isValidName(name)) {
        logger.warn(`[OPENAI fallback reason] Invalid or junk character name returned: '${name}'`);
        throw new Error("Invalid or junk character name returned");
      }
      logger.info(`[OPENAI] ${name}`);
      await logRandomCharacter(`[OPENAI] ${name}`);
      res.status(200).json({ name });
      return;
    } catch (err) {
      lastError = err;
      tries++;
      logger.warn(`[OPENAI retry ${tries}] Error or invalid name: ${err instanceof Error ? err.message : String(err)}`);
      // Wait a bit before retrying
      if (tries < 3) await new Promise(res => setTimeout(res, 400 * tries));
    }
  }
  // Fallback after 3 failed attempts
  logger.warn(`[FALLBACK] Gandalf - Reason: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  const fallback = 'Gandalf';
  await logRandomCharacter(`[FALLBACK] ${fallback}`);
  res.status(200).json({ name: fallback, fallback: true, error: "Failed to get random character after 3 attempts, using fallback." });
}
