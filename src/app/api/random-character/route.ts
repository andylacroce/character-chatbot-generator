/**
 * API endpoint for picking a random public-domain character name.
 * Uses a static in-process list; no LLM call required.
 */

import type { NextRequest } from "next/server";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { pickRandomCharacterName } from "../../../utils/moderation/pickRandomCharacterName";
import characterNames from "../../../data/characterNames";
import { withRoute } from "../../../utils/server/withRoute";

// Track names shown this server session to avoid repetition
const recentNames: string[] = [];
const MAX_RECENT_NAMES = 100;

/**
 * GET /api/random-character handler — see the @swagger block below for the documented contract.
 *
 * @swagger
 * /random-character:
 *   get:
 *     summary: Get a random public-domain character name
 *     description: >
 *       Picks from a static in-process list (pre-1928/mythology/historical figures)
 *       without repeating a name until the whole list has been shown this session.
 *       No LLM call.
 *     tags: [Character]
 *     responses:
 *       200:
 *         description: A character name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: Sherlock Holmes
 */
export const GET = withRoute(null, async (_req: NextRequest) => {
  const available = characterNames.filter((name) => !recentNames.includes(name));
  if (available.length === 0) {
    // All names have been shown — reset and start a fresh no-repeat cycle
    recentNames.length = 0;
  }

  const chosen = pickRandomCharacterName(recentNames);
  recentNames.push(chosen);
  while (recentNames.length > MAX_RECENT_NAMES) recentNames.shift();

  logEvent(
    "info",
    "random_character_generated",
    "Random character generated",
    sanitizeLogMeta({
      chosen,
      recentNamesCount: recentNames.length,
    }),
  );

  return Response.json({ name: chosen });
});
