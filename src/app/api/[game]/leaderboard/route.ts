/** Public leaderboard of a guessing game's players who opted in to showing their score. */

import { gameRoute } from "../../../../utils/game/route";
import { getLeaderboard } from "../../../../utils/game/scores";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";

/**
 * Reads the current environment's public leaderboard.
 *
 * @swagger
 * /{game}/leaderboard:
 *   get:
 *     summary: List opted-in players' best streaks
 *     description: Returns only the top ten overall scores whose players opted in with a moderated display name. Guests may read it. Returns an empty list when the optional database is unavailable.
 *     tags: [Game]
 *     parameters:
 *       - $ref: '#/components/parameters/Game'
 *     responses:
 *       200:
 *         description: Public leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank: { type: integer }
 *                       name: { type: string }
 *                       streak: { type: integer }
 *       404:
 *         description: Unknown game
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to load leaderboard
 */
export const GET = gameRoute(
  {
    endpoint: "leaderboard",
    max: 30,
    message: "Too many requests from this IP, please try again later.",
  },
  async (game) => {
    if (!process.env.DATABASE_URL) {
      return Response.json({ entries: [] });
    }
    try {
      return Response.json({ entries: await getLeaderboard(game) });
    } catch (err) {
      logEvent(
        "error",
        `${game.eventPrefix}_leaderboard_get_failed`,
        "Failed to load leaderboard",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      return Response.json({ error: "Failed to load leaderboard" }, { status: 500 });
    }
  },
);
