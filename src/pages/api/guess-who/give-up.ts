/**
 * API endpoint for voluntarily giving up a "Guess Who" run. Decodes the token (which
 * alone is enough to know the hidden character), generates its avatar for the reveal,
 * and ends the run. Mirrors guess-who-next/give-up.ts's shape.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { verifyGuessWhoState } from "../../../utils/guessWhoToken";
import { getOrGenerateAvatar } from "../../../utils/avatarGeneration";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { recordEvent } from "../../../utils/analytics";
import { withRequestLog } from "../../../utils/withRequestLog";

/** Rate limiter: 10 requests per minute per IP, shared tier with the other Guess Who endpoints. */
const guessWhoGiveUpRateLimit = createRateLimiter({
  name: "guess-who-give-up",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for voluntarily giving up a "Guess Who" run.
 *
 * @swagger
 * /guess-who/give-up:
 *   post:
 *     summary: Give up the current Guess Who run
 *     description: >
 *       Verifies the caller's `guessWhoToken` (rejecting an invalid/tampered one with
 *       400), reveals the hidden character with its avatar, and ends the run. Rate
 *       limited to 10 requests/minute/IP.
 *     tags: [GuessWho]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [guessWhoToken]
 *             properties:
 *               guessWhoToken: { type: string }
 *     responses:
 *       200:
 *         description: The run is over and the hidden character is revealed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revealedName: { type: string }
 *                 avatarUrl: { type: string }
 *                 gender: { type: string, nullable: true }
 *                 finalStreak: { type: integer }
 *                 gameOver: { type: boolean }
 *       400:
 *         description: Missing token, or invalid/expired token
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(guessWhoGiveUpRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { guessWhoToken } = req.body ?? {};
  const state = verifyGuessWhoState(guessWhoToken);
  if (!state) {
    logEvent("info", "guess_who_invalid_token", "Rejected an invalid or expired Guess Who token");
    res.status(400).json({ error: "Your game session has expired. Please start a new game." });
    return;
  }

  try {
    const { avatarUrl, gender } = await getOrGenerateAvatar(state.hiddenName, {
      recognized: true,
    });
    logEvent(
      "info",
      "guess_who_gave_up",
      "Player gave up the Guess Who run",
      sanitizeLogMeta({ finalStreak: state.streak }),
    );
    void recordEvent(
      "guess_who_run_ended",
      { reason: "give_up", finalStreak: state.streak },
      state.issuedForUserId,
    );
    res.status(200).json({
      revealedName: state.hiddenName,
      avatarUrl,
      gender,
      finalStreak: state.streak,
      gameOver: true,
    });
  } catch (err) {
    logEvent(
      "error",
      "guess_who_give_up_failed",
      "Failed to reveal the hidden character on give-up",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to end the run" });
  }
}

export default withRequestLog(handler);
