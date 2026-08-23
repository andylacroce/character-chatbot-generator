/**
 * API endpoint for generating a character personality prompt via Claude.
 * Accepts POST requests with a character name and returns a personality string.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { sanitizeCharacterName } from "../../src/utils/security";
import { createRateLimiter } from "../../src/utils/rateLimit";
import { generatePersonalityPrompt } from "../../src/config/serverConfig";

/** Rate limiter: 20 requests per minute per IP (personality generation is lightweight). */
const personalityRateLimit = createRateLimiter({
  name: "personality",
  max: 20,
  message: "Too many personality generation requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for generating a character personality prompt using Claude.
 * Accepts POST requests with a character name and returns a personality string.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 *
 * @swagger
 * /generate-personality:
 *   post:
 *     summary: Generate a character personality prompt
 *     description: Rate limited to 20 requests/minute/IP.
 *     tags: [Character]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sherlock Holmes
 *     responses:
 *       200:
 *         description: Generated personality prompt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 personality:
 *                   type: string
 *                 correctedName:
 *                   type: string
 *       400:
 *         description: Valid name required, or invalid character name
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate personality prompt
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // Apply rate limiting
  await new Promise<void>((resolve) => {
    personalityRateLimit(req, res, () => resolve());
  });
  if (res.headersSent) {
    return;
  }
  const { name: originalName } = req.body;
  if (!originalName || typeof originalName !== 'string') {
    res.status(400).json({ error: "Valid name required" });
    return;
  }
  const sanitizedName = sanitizeCharacterName(originalName);
  if (!sanitizedName) {
    res.status(400).json({ error: "Invalid character name" });
    return;
  }
  
  try {
    logEvent("info", "personality_prompt_start", "Generating personality prompt", sanitizeLogMeta({
      name: sanitizedName
    }));
    
    const concisePrompt = await generatePersonalityPrompt(sanitizedName);
    
    logEvent("info", "personality_prompt_generated", "Personality prompt generated", sanitizeLogMeta({
      name: sanitizedName
    }));
    
    res.status(200).json({ personality: concisePrompt, correctedName: sanitizedName });
  } catch (err) {
    logEvent("error", "personality_prompt_error", "Error generating personality prompt", sanitizeLogMeta({
      name: sanitizedName,
      error: err instanceof Error ? err.message : String(err)
    }));
    res.status(500).json({ error: "Failed to generate personality prompt" });
  }
  return;
}
