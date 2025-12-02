// =============================
// pages/api/generate-personality.ts
// Next.js API route for generating a character personality prompt using OpenAI.
// Accepts POST requests with a character name and returns a personality string.
// =============================

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { sanitizeCharacterName } from "../../src/utils/security";
import rateLimit from "express-rate-limit";
import { generatePersonalityPrompt } from "../../src/config/serverConfig";

// Rate limiter: 20 requests per minute per IP (personality generation is lightweight)
const personalityRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: {
    error: "Too many personality generation requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Handle IP extraction for Next.js API routes
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           (req.headers['x-real-ip'] as string) ||
           (req.connection?.remoteAddress) ||
           (req.socket?.remoteAddress) ||
           'unknown';
  },
});

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
