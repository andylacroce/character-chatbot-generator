/**
 * API endpoint for validating character names against copyright and trademark concerns.
 * Uses Claude to determine if a character is likely protected by copyright or trademark.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getClaudeModel } from "../../src/utils/claudeModelSelector";
import { createRateLimiter, applyRateLimit } from "../../src/utils/rateLimit";
import { extractJson } from "../../src/utils/parseClaudeJson";
import anthropic from "../../src/utils/anthropicClient";

/** Rate limiter: 30 requests per minute per IP. */
const validationRateLimit = createRateLimiter({
  name: "validate-character",
  max: 30,
  message: "Too many validation requests from this IP, please try again later.",
});

export interface CharacterValidationResult {
  characterName: string;
  isPublicDomain: boolean;
  isSafe: boolean;
  warningLevel: "none" | "caution" | "warning";
  reason?: string;
  suggestions?: string[];
  // Set when the name itself is profane, a slur, or otherwise abusive — distinct
  // from warningLevel (which is copyright/trademark-only and always overridable
  // via "Continue Anyway"). A blocked name has no override: the character wall
  // at /chars is public, so a name like this can't be allowed to exist at all,
  // not just flagged with a warning.
  blocked?: boolean;
}

/**
 * Next.js API route handler for validating character names.
 * Returns whether the character is safe to use, if copyright/trademark concerns
 * exist, and whether the name itself is abusive content that must be hard-blocked.
 *
 * @swagger
 * /validate-character:
 *   post:
 *     summary: Validate a character name for copyright/trademark concerns and abusive content
 *     description: >
 *       Uses Claude for two independent checks: whether the name is public-domain-safe,
 *       cautionary, or a clear copyright/trademark violation (warningLevel — always
 *       overridable), and whether the name itself is profane/abusive (blocked — never
 *       overridable, since created characters appear on the public /chars gallery).
 *       Rate limited to 30 requests/minute/IP. On an internal error, responds 200 with
 *       warningLevel "none" and blocked false rather than blocking creation.
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
 *                 example: Mickey Mouse
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characterName:
 *                   type: string
 *                 isPublicDomain:
 *                   type: boolean
 *                 isSafe:
 *                   type: boolean
 *                 warningLevel:
 *                   type: string
 *                   enum: [none, caution, warning]
 *                 reason:
 *                   type: string
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 blocked:
 *                   type: boolean
 *                   description: >
 *                     True when the name itself is profane/abusive — distinct from
 *                     warningLevel (copyright-only, always overridable). Never
 *                     overridable: the character wall at /chars is public.
 *       400:
 *         description: Valid character name required
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
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
  if (!(await applyRateLimit(validationRateLimit, req, res))) {
    return;
  }

  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: "Valid character name required" });
    return;
  }

  const characterName = name.trim();

  try {
    const model = getClaudeModel("text-simple");

    const response = await anthropic.messages.create({
      model,
      system: `You are a content-safety and copyright/trademark expert AI. Analyze character names for two, entirely separate concerns:

1. Abusive content: is the name itself profane, a slur or hate-speech term, sexually explicit, or otherwise abusive (in English or any other language, including l33tspeak/spacing tricks meant to evade filters)? This app publishes every created character's name and portrait on a public gallery page, so a name like this can never be allowed to exist, not just be flagged.
2. Copyright/trademark status (entirely independent of concern 1 — a name can be blocked for both, one, or neither):
   - Publication/creation date (pre-1928 works are typically US public domain)
   - Trademark status (e.g., Disney characters, modern franchises)
   - Whether it's a historical figure vs fictional character
   - Active copyright protection

Return ONLY valid JSON with this exact schema:
{
  "blocked": boolean,
  "isPublicDomain": boolean,
  "isSafe": boolean,
  "warningLevel": "none" | "caution" | "warning",
  "reason": "Brief explanation (1-2 sentences)",
  "suggestions": ["alternative1", "alternative2", "alternative3"]
}

"blocked" guide:
- true: the name itself is profane, a slur, hate speech, sexually explicit, or otherwise abusive.
- false: none of the above — completely independent of whether it's copyrighted.

warningLevel guide (only about copyright/trademark, ignore concern 1 entirely here):
- "none": Clearly public domain (historical figures, ancient mythology, pre-1928 classics)
- "caution": Uncertain status or lesser-known character
- "warning": Clearly copyrighted/trademarked (Disney, Marvel, modern franchises, etc.)`,
      messages: [
        {
          role: "user",
          content: `Analyze this character name: "${characterName}"\n\nProvide validation result as JSON.`
        }
      ],
      max_tokens: 250,
      temperature: 0.3,
    });

    const content = extractJson(response.content[0]?.type === "text" ? response.content[0].text : '{}');
    const validation = JSON.parse(content);

    const result: CharacterValidationResult = {
      characterName,
      isPublicDomain: validation.isPublicDomain ?? true,
      isSafe: validation.isSafe ?? true,
      warningLevel: validation.warningLevel || "none",
      reason: validation.reason || "",
      suggestions: Array.isArray(validation.suggestions) ? validation.suggestions : [],
      blocked: validation.blocked === true,
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
      suggestions: [],
      blocked: false,
    } as CharacterValidationResult);
  }
}
