/**
 * A player's personal best streak in a guessing game. Guests (no session) read their
 * cookie-bound best; deployments with no DATABASE_URL get `{ highScore: null }`, not an
 * error, the same degrade-gracefully shape as pages/api/user-profile.ts. Read-only: the value
 * is only ever written server-side, from the message route's correct-guess branch, never from
 * a client-supplied field.
 */

import { gameRoute, rejectMethod } from "../../../utils/game/route";
import { getGuestHighScore, getHighScore } from "../../../utils/game/scores";
import { getGuestId } from "../../../utils/gameGuestIdentity";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";

/**
 * Next.js API route handler for reading the caller's personal best streak.
 *
 * @swagger
 * /{game}/high-score:
 *   get:
 *     summary: Get the caller's personal best streak
 *     description: >
 *       Reads either an account score or a cookie-bound guest score. Returns null when no
 *       database is configured or this browser has no score. Rate limited to 20
 *       requests/minute/IP.
 *     tags: [Game]
 *     parameters:
 *       - $ref: '#/components/parameters/Game'
 *     responses:
 *       200:
 *         description: The caller's personal best, or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 highScore: { type: integer, nullable: true }
 *       404:
 *         description: Unknown game
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
export default gameRoute(
  {
    endpoint: "high-score",
    max: 20,
    message: "Too many requests from this IP, please try again later.",
  },
  async (game, req, res) => {
    if (rejectMethod(req, res, ["GET"])) return;

    const userId = await getSessionUserId(req);
    const guestId = userId ? null : getGuestId(req);
    if ((!userId && !guestId) || !process.env.DATABASE_URL) {
      res.status(200).json({ highScore: null });
      return;
    }

    try {
      const highScore = userId
        ? await getHighScore(game, userId)
        : await getGuestHighScore(game, guestId!);
      res.status(200).json({ highScore });
    } catch (err) {
      logEvent(
        "error",
        `${game.eventPrefix}_guest_high_score_get_failed`,
        "Failed to load guest personal best",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      res.status(200).json({ highScore: null });
    }
  },
);
