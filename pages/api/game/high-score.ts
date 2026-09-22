/**
 * API endpoint for a signed-in user's personal best guessing-game streak. Guests (no
 * session) and deployments with no DATABASE_URL configured get `{ highScore: null }`,
 * not an error — same degrade-gracefully shape as pages/api/user-profile.ts. Read-only:
 * the value is only ever written server-side, from pages/api/game/message.ts's correct-
 * guess branch, never from a client-supplied field.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getHighScore } from "../../../src/utils/gameHighScore";
import { getGuestHighScore } from "../../../src/utils/gameLeaderboard";
import { getGuestId } from "../../../src/utils/gameGuestIdentity";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { withRequestLog } from "../../../src/utils/withRequestLog";

/** Rate limiter: 20 requests per minute per IP, same tier as /api/user-profile. */
const gameHighScoreRateLimit = createRateLimiter({
  name: "game-high-score",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for reading the signed-in user's personal best streak.
 *
 * @swagger
 * /game/high-score:
 *   get:
 *     summary: Get the signed-in user's personal best guessing-game streak
 *     description: >
 *       Reads either an account score or a cookie-bound guest score. Returns null
 *       when no database is configured or this browser has no score.
 *     tags: [Game]
 *     responses:
 *       200:
 *         description: The user's personal best, or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 highScore:
 *                   type: integer
 *                   nullable: true
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(gameHighScoreRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const userId = await getSessionUserId(req);
  const guestId = userId ? null : getGuestId(req);
  if ((!userId && !guestId) || !process.env.DATABASE_URL) {
    res.status(200).json({ highScore: null });
    return;
  }

  try {
    const highScore = userId ? await getHighScore(userId) : await getGuestHighScore(guestId!);
    res.status(200).json({ highScore });
  } catch (err) {
    logEvent(
      "error",
      "game_guest_high_score_get_failed",
      "Failed to load guest personal best",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(200).json({ highScore: null });
  }
}

export default withRequestLog(handler);
