/**
 * API endpoint for generating a character personality prompt via Claude.
 * Accepts POST requests with a character name and returns a personality string.
 */

import type { NextRequest } from "next/server";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { sanitizeCharacterName } from "../../../utils/server/security";
import { generatePersonalityPrompt } from "../../../config/serverConfig";
import { getSessionUserId } from "../../../utils/account/getSessionUserId";
import { recordEvent } from "../../../utils/analytics";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db/client";
import { avatarCache } from "../../../db/schema";
import { withRoute, readJson } from "../../../utils/server/withRoute";

// Capped so this stays a cheap, bounded addition to a call already being made — not a
// full table dump on every character launch. Ordering by recency is an arbitrary but
// reasonable bias (no principled way to guess which existing names a given typo is
// closest to without the fuzzy-match step itself), and the cap is generous enough for
// this app's hobby-scale character count.
const MAX_EXISTING_NAMES_FOR_MATCHING = 300;

/**
 * Fetches a bounded sample of already-cached character names, for `generatePersonalityPrompt`'s
 * fuzzy-match step — so "sherlok holmes" resolves to the same avatar_cache row as an
 * existing "Sherlock Holmes" instead of spawning a misspelled duplicate. Returns [] on
 * any error or when no DATABASE_URL is configured — fuzzy matching is a nice-to-have,
 * never a requirement for character selection to work.
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

const LIMIT = {
  name: "personality",
  max: 20,
  message: "Too many personality generation requests from this IP, please try again later.",
};

/**
 * Generates a character's personality prompt with Claude.
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
 *                   description: >
 *                     `name` with spelling/capitalization corrected and expanded to its
 *                     fullest commonly recognized form (e.g. "Einstein" ->
 *                     "Albert Einstein") when one genuinely exists. When it's a likely
 *                     misspelling, shortened form, or minor variant of an already-created
 *                     character, this is that existing character's exact name instead, so
 *                     the two share one avatar_cache entry rather than spawning a duplicate.
 *       400:
 *         description: Valid name required, or invalid character name
 *       422:
 *         description: Name is not a recognized historical, mythological, literary, or fictional figure
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate personality prompt
 */
export const POST = withRoute(LIMIT, async (req: NextRequest) => {
  const body = await readJson(req);
  const { name: originalName } = body;
  if (!originalName || typeof originalName !== "string") {
    return Response.json({ error: "Valid name required" }, { status: 400 });
  }
  const sanitizedName = sanitizeCharacterName(originalName);
  if (!sanitizedName) {
    return Response.json({ error: "Invalid character name" }, { status: 400 });
  }
  try {
    logEvent(
      "info",
      "personality_prompt_start",
      "Generating personality prompt",
      sanitizeLogMeta({ name: sanitizedName }),
    );

    const existingNames = await fetchExistingCharacterNames();
    const {
      prompt: concisePrompt,
      correctedName,
      recognized,
    } = await generatePersonalityPrompt(sanitizedName, existingNames);

    if (recognized === false) {
      logEvent(
        "info",
        "personality_unrecognized_rejected",
        "Unrecognized character rejected by personality generation",
        sanitizeLogMeta({ name: sanitizedName }),
      );
      return Response.json(
        { error: "Choose a character or person from history or fiction." },
        { status: 422 },
      );
    }

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
    const userId = await getSessionUserId(req);
    await recordEvent("bot_created", { guest: !userId }, userId);

    return Response.json({ personality: concisePrompt, correctedName });
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
    return Response.json({ error: "Failed to generate personality prompt" }, { status: 500 });
  }
});
