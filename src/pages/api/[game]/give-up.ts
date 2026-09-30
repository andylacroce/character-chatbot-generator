/**
 * Voluntarily gives up a guessing-game run. Decodes the round token, which alone is enough
 * to know the hidden character, reveals it, and ends the run: no Claude call, avatar
 * regeneration or audio, since nothing changes visually except the reveal itself. The client
 * shows its ordinary game-over UI, identical to the two-wrong-guesses path.
 */

import { gameRoute, rejectMethod } from "../../../utils/game/route";
import { verifyGameState } from "../../../utils/game/token";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { recordEvent } from "../../../utils/analytics";

/**
 * Next.js API route handler for voluntarily giving up a guessing-game run.
 *
 * @swagger
 * /{game}/give-up:
 *   post:
 *     summary: Give up the current guessing-game run
 *     description: >
 *       Verifies the caller's round token (rejecting an invalid/tampered one with 400),
 *       reveals the hidden character, and ends the run. "guess-who" also returns the
 *       revealed character's `avatarUrl` and `gender`. Rate limited to 10 requests/minute/IP.
 *     tags: [Game]
 *     parameters:
 *       - $ref: '#/components/parameters/Game'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               guessWhoToken: { type: string, description: The round token ("guess-who") }
 *               gameToken: { type: string, description: The round token ("guess-who-next") }
 *     responses:
 *       200:
 *         description: The run is over and the hidden character is revealed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revealedName: { type: string }
 *                 avatarUrl: { type: string, description: '"guess-who" only' }
 *                 gender: { type: string, nullable: true, description: '"guess-who" only' }
 *                 finalStreak: { type: integer }
 *                 gameOver: { type: boolean }
 *       400:
 *         description: Missing token, or invalid/expired token
 *       404:
 *         description: Unknown game
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
export default gameRoute({ endpoint: "give-up", max: 10 }, async (game, req, res) => {
  if (rejectMethod(req, res, ["POST"])) return;

  const state = verifyGameState(req.body?.[game.tokenField], game.id);
  if (!state) {
    logEvent(
      "info",
      `${game.eventPrefix}_invalid_token`,
      "Rejected an invalid or expired game token",
    );
    res.status(400).json({ error: "Your game session has expired. Please start a new game." });
    return;
  }

  logEvent(
    "info",
    `${game.eventPrefix}_gave_up`,
    `Player gave up the ${game.title} run`,
    sanitizeLogMeta({ finalStreak: state.streak }),
  );
  void recordEvent(
    `${game.eventPrefix}_run_ended`,
    { reason: "give_up", finalStreak: state.streak },
    state.issuedForUserId,
  );

  res.status(200).json({
    revealedName: state.targetName,
    ...(game.hidesSpeaker ? { avatarUrl: state.avatarUrl, gender: state.gender } : {}),
    finalStreak: state.streak,
    gameOver: true,
  });
});
