/** Public leaderboard of a guessing game's players who opted in to showing their score. */

import { gameRoute, rejectMethod } from "../../../utils/game/route";
import { getLeaderboard } from "../../../utils/game/scores";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";

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
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to load leaderboard
 */
export default gameRoute(
  {
    endpoint: "leaderboard",
    max: 30,
    message: "Too many requests from this IP, please try again later.",
  },
  async (game, req, res) => {
    if (rejectMethod(req, res, ["GET"])) return;
    if (!process.env.DATABASE_URL) {
      res.status(200).json({ entries: [] });
      return;
    }
    try {
      res.status(200).json({ entries: await getLeaderboard(game) });
    } catch (err) {
      logEvent(
        "error",
        `${game.eventPrefix}_leaderboard_get_failed`,
        "Failed to load leaderboard",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      res.status(500).json({ error: "Failed to load leaderboard" });
    }
  },
);
