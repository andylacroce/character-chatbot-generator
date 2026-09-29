/** Public leaderboard of "Guess Who" players who opted in. Mirrors guess-who-next/leaderboard.ts. */

import type { NextApiRequest, NextApiResponse } from "next";
import { getLeaderboard } from "../../../utils/guessWhoLeaderboard";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";

const guessWhoLeaderboardRateLimit = createRateLimiter({
  name: "guess-who-leaderboard",
  max: 30,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Reads the current environment's public "Guess Who" leaderboard.
 *
 * @swagger
 * /guess-who/leaderboard:
 *   get:
 *     summary: List opted-in players' best Guess Who streaks
 *     description: Returns only the top ten overall scores whose players opted in with a moderated display name. Guests may read it. Returns an empty list when the optional database is unavailable.
 *     tags: [GuessWho]
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
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to load leaderboard
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(guessWhoLeaderboardRateLimit, req, res))) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(200).json({ entries: [] });
    return;
  }
  try {
    res.status(200).json({ entries: await getLeaderboard() });
  } catch (err) {
    logEvent(
      "error",
      "guess_who_leaderboard_get_failed",
      "Failed to load leaderboard",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
}

export default withRequestLog(handler);
