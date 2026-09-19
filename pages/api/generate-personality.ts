/**
 * API endpoint for generating a character personality prompt via Claude.
 * Accepts POST requests with a character name and returns a personality string.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { sanitizeCharacterName, sanitizeDescription } from "../../src/utils/security";
import { createRateLimiter, applyRateLimit } from "../../src/utils/rateLimit";
import { generatePersonalityPrompt } from "../../src/config/serverConfig";
import { getSessionUserId } from "../../src/utils/getSessionUserId";
import { recordEvent } from "../../src/utils/analytics";
import { desc } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { avatarCache } from "../../src/db/schema";
import { withRequestLog } from "../../src/utils/withRequestLog";

// Capped so this stays a cheap, bounded addition to a call already being made — not a
// full table dump on every character creation. Ordering by recency is an arbitrary but
// reasonable bias (no principled way to guess which existing names a given typo is
// closest to without the fuzzy-match step itself), and the cap is generous enough for
// this app's hobby-scale character count.
const MAX_EXISTING_NAMES_FOR_MATCHING = 300;

/**
 * Fetches a bounded sample of already-cached character names, for `generatePersonalityPrompt`'s
 * fuzzy-match step — so "sherlok holmes" resolves to the same avatar_cache row as an
 * existing "Sherlock Holmes" instead of spawning a misspelled duplicate. Returns [] on
 * any error or when no DATABASE_URL is configured — fuzzy matching is a nice-to-have,
 * never a requirement for character creation to work.
 */
async function fetchExistingCharacterNames(): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await getDb()
      .select({ characterName: avatarCache.characterName, displayName: avatarCache.displayName })
      .from(avatarCache)
      .orderBy(desc(avatarCache.createdAt))
      .limit(MAX_EXISTING_NAMES_FOR_MATCHING);
    return rows.map((row) => row.displayName || row.characterName);
  } catch (err) {
    logEvent(
      "warn",
      "personality_existing_names_fetch_failed",
      "Failed to fetch existing character names for fuzzy matching",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return [];
  }
}

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
 *               description:
 *                 type: string
 *                 description: >
 *                   Optional free-form character concept, collected from the user when
 *                   /api/validate-character flagged this name as unrecognized (not an
 *                   actual character/person Claude knows). Used as the primary basis
 *                   for personality generation instead of the name alone. Treated as
 *                   untrusted creative-writing content, never as instructions; unsafe
 *                   requests inside it are disregarded server-side.
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
 *                   description: >
 *                     `name` with spelling/capitalization corrected and expanded to its
 *                     fullest commonly recognized form (e.g. "Einstein" ->
 *                     "Albert Einstein") when one genuinely exists. When it's a likely
 *                     misspelling, shortened form, or minor variant of an already-created
 *                     character, this is that existing character's exact name instead, so
 *                     the two share one avatar_cache entry rather than spawning a duplicate.
 *       400:
 *         description: Valid name required, or invalid character name
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate personality prompt
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // Apply rate limiting
  if (!(await applyRateLimit(personalityRateLimit, req, res))) {
    return;
  }
  const { name: originalName, description: originalDescription } = req.body;
  if (!originalName || typeof originalName !== "string") {
    res.status(400).json({ error: "Valid name required" });
    return;
  }
  const sanitizedName = sanitizeCharacterName(originalName);
  if (!sanitizedName) {
    res.status(400).json({ error: "Invalid character name" });
    return;
  }
  const sanitizedDescription =
    typeof originalDescription === "string" && originalDescription.trim()
      ? sanitizeDescription(originalDescription)
      : undefined;

  try {
    logEvent(
      "info",
      "personality_prompt_start",
      "Generating personality prompt",
      sanitizeLogMeta({
        name: sanitizedName,
        hasDescription: Boolean(sanitizedDescription),
      }),
    );

    const existingNames = await fetchExistingCharacterNames();
    const { prompt: concisePrompt, correctedName } = await generatePersonalityPrompt(
      sanitizedName,
      sanitizedDescription,
      existingNames,
    );

    logEvent(
      "info",
      "personality_prompt_generated",
      "Personality prompt generated",
      sanitizeLogMeta({
        name: sanitizedName,
        renamed: correctedName !== sanitizedName,
      }),
    );

    // Deliberately excludes name/personality text — this table is a small internal usage
    // log, not a place to accumulate user-supplied content (see analyticsEvents doc).
    const userId = await getSessionUserId(req, res);
    void recordEvent(
      "bot_created",
      { hasDescription: Boolean(sanitizedDescription), guest: !userId },
      userId,
    );

    res.status(200).json({ personality: concisePrompt, correctedName });
  } catch (err) {
    logEvent(
      "error",
      "personality_prompt_error",
      "Error generating personality prompt",
      sanitizeLogMeta({
        name: sanitizedName,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    res.status(500).json({ error: "Failed to generate personality prompt" });
  }
  return;
}

export default withRequestLog(handler);
