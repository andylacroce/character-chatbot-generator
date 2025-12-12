/**
 * API endpoint for validating character names against copyright and trademark concerns.
 * Uses OpenAI to determine if a character is likely protected by copyright or trademark.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getOpenAIModel } from "../../src/utils/openaiModelSelector";
import rateLimit from "express-rate-limit";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Rate limiter: 30 requests per minute per IP
const validationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    error: "Too many validation requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           (req.headers['x-real-ip'] as string) ||
           (req.connection?.remoteAddress) ||
           (req.socket?.remoteAddress) ||
           'unknown';
  },
});

export interface CharacterValidationResult {
  characterName: string;
  isPublicDomain: boolean;
  isSafe: boolean;
  warningLevel: "none" | "caution" | "warning";
  reason?: string;
  suggestions?: string[];
}

/**
 * Next.js API route handler for validating character names.
 * Returns whether the character is safe to use or if copyright/trademark concerns exist.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    logEvent("warn", "validate_character_method_not_allowed", "Validate character API method not allowed", sanitizeLogMeta({
      method: req.method
    }));
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Apply rate limiting
  await new Promise<void>((resolve) => {
    validationRateLimit(req, res, () => resolve());
  });
  if (res.headersSent) {
    return;
  }

  const { name } = req.body;
  
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: "Valid character name required" });
    return;
  }

  const characterName = name.trim();

  try {
    const model = getOpenAIModel("text");
    
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a copyright and trademark expert AI. Analyze character names to determine if they are:
1. In the public domain (safe to use)
2. Protected by copyright/trademark (not safe)

Consider:
- Publication/creation date (pre-1928 works are typically US public domain)
- Trademark status (e.g., Disney characters, modern franchises)
- Whether it's a historical figure vs fictional character
- Active copyright protection

Return ONLY valid JSON with this exact schema:
{
  "isPublicDomain": boolean,
  "isSafe": boolean,
  "warningLevel": "none" | "caution" | "warning",
  "reason": "Brief explanation (1-2 sentences)",
  "suggestions": ["alternative1", "alternative2", "alternative3"]
}

warningLevel guide:
- "none": Clearly public domain (historical figures, ancient mythology, pre-1928 classics)
- "caution": Uncertain status or lesser-known character
- "warning": Clearly copyrighted/trademarked (Disney, Marvel, modern franchises, etc.)`
        },
        {
          role: "user",
          content: `Analyze this character name for copyright/trademark concerns: "${characterName}"\n\nProvide validation result as JSON.`
        }
      ],
      max_tokens: 250,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content?.trim() || '{}';
    const validation = JSON.parse(content);

    const result: CharacterValidationResult = {
      characterName,
      isPublicDomain: validation.isPublicDomain ?? true,
      isSafe: validation.isSafe ?? true,
      warningLevel: validation.warningLevel || "none",
      reason: validation.reason || "",
      suggestions: Array.isArray(validation.suggestions) ? validation.suggestions : []
    };

    logEvent("info", "character_validated", "Character validation completed", sanitizeLogMeta({
      characterName,
      isSafe: result.isSafe,
      warningLevel: result.warningLevel
    }));

    res.status(200).json(result);
  } catch (err) {
    logEvent("error", "character_validation_failed", "Failed to validate character", sanitizeLogMeta({
      characterName,
      error: err instanceof Error ? err.message : String(err)
    }));
    
    // On error, default to safe (allow continuation but with caution)
    res.status(200).json({
      characterName,
      isPublicDomain: true,
      isSafe: true,
      warningLevel: "none",
      reason: "Unable to validate at this time. Please proceed with caution.",
      suggestions: []
    } as CharacterValidationResult);
  }
}
