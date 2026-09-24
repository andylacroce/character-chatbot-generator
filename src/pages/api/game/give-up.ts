/**
 * API endpoint for voluntarily giving up a guessing-game run. Decodes the game
 * token (which alone is enough to know the hidden character), reveals
 * `nextCharacterName`, and ends the run — no Claude call, avatar regeneration,
 * or audio needed, since nothing changes visually except the reveal itself. The
 * client shows the existing game-over UI with the revealed name, identical to
 * the two-wrong-guess path. See CLAUDE.md's "Guessing game" section.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { verifyGameState } from "../../../utils/gameToken";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { recordEvent } from "../../../utils/analytics";
import { withRequestLog } from "../../../utils/withRequestLog";

/** Rate limiter: 10 requests per minute per IP, shared tier with the other game endpoints. */
const giveUpRateLimit = createRateLimiter({
  name: "game-give-up",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for voluntarily giving up a guessing-game run.
 *
 * @swagger
 * /game/give-up:
 *   post:
 *     summary: Give up the current guessing-game run
 *     description: >
 *       Verifies the caller's `gameToken` (rejecting an invalid/tampered one
 *       with 400), reveals the hidden `nextCharacterName`, and ends the run.
 *       No Claude call or avatar regeneration — the hidden name is already
 *       inside the token. Returns the same shape the client uses for a
 *       game-over: `{ revealedName, finalStreak, gameOver: true }`.
 *       Rate limited to 10 requests/minute/IP.
 *     tags: [Game]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameToken]
 *             properties:
 *               gameToken:
 *                 type: string
 *                 description: The signed game token from /game/start
 *     responses:
 *       200:
 *         description: The run is over and the hidden character is revealed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revealedName:
 *                   type: string
 *                 finalStreak:
 *                   type: integer
 *                 gameOver:
 *                   type: boolean
 *       400:
 *         description: Missing game token, or invalid/expired token
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(giveUpRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { gameToken } = req.body;
  const state = verifyGameState(gameToken);
  if (!state) {
    logEvent("info", "game_invalid_token", "Rejected an invalid or expired game token");
    res.status(400).json({ error: "Your game session has expired. Please start a new game." });
    return;
  }

  logEvent(
    "info",
    "game_gave_up",
    "Player gave up the guessing-game run",
    sanitizeLogMeta({ finalStreak: state.streak }),
  );
  void recordEvent(
    "game_run_ended",
    { reason: "give_up", finalStreak: state.streak },
    state.issuedForUserId,
  );

  res.status(200).json({
    revealedName: state.nextCharacterName,
    finalStreak: state.streak,
    gameOver: true,
  });
}

export default withRequestLog(handler);
