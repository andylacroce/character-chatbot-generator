/**
 * API endpoint for a signed-in user's (or guest's) personal best "Guess Who" streak.
 * Mirrors guess-who-next/high-score.ts exactly, against the separate
 * guessWhoHighScore.ts/guessWhoLeaderboard.ts helpers.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getHighScore } from "../../../utils/guessWhoHighScore";
import { getGuestHighScore } from "../../../utils/guessWhoLeaderboard";
import { getGuestId } from "../../../utils/gameGuestIdentity";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { withRequestLog } from "../../../utils/withRequestLog";

/** Rate limiter: 20 requests per minute per IP, same tier as guess-who-next-high-score. */
const guessWhoHighScoreRateLimit = createRateLimiter({
  name: "guess-who-high-score",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for reading the caller's personal best Guess Who streak.
 *
 * @swagger
 * /guess-who/high-score:
 *   get:
 *     summary: Get the signed-in user's (or guest's) personal best Guess Who streak
 *     description: >
 *       Reads either an account score or a cookie-bound guest score. Returns null when
 *       no database is configured or this browser has no score.
 *     tags: [GuessWho]
 *     responses:
 *       200:
 *         description: The user's personal best, or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 highScore: { type: integer, nullable: true }
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(guessWhoHighScoreRateLimit, req, res))) return;

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
      "guess_who_guest_high_score_get_failed",
      "Failed to load guest personal best",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(200).json({ highScore: null });
  }
}

export default withRequestLog(handler);
