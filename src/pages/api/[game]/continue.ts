/**
 * Generates a guessing game's next round after a correct guess. The message route judges a
 * guess and returns the reaction fast, then the player clicks "Continue" and only then does
 * this route run the full persona, avatar, voice, reply and TTS pipeline, so a correct guess
 * is never held up by the next round's generation. Only callable once the token's
 * `canContinue` is true (set solely by a judged-correct guess), so it can't be driven from an
 * unjudged token.
 */

import { gameRoute, rejectMethod } from "../../../utils/game/route";
import {
  generateGameRound,
  planRound,
  roundResult,
  roundState,
  sendRoundError,
  sendRoundResult,
  startRoundStream,
} from "../../../utils/game/round";
import { signGameState, verifyGameState } from "../../../utils/game/token";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { recordEvent } from "../../../utils/analytics";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";

/**
 * Next.js API route handler that generates the next round after a correct guess.
 *
 * @swagger
 * /{game}/continue:
 *   post:
 *     summary: Generate the next round after a correct guess
 *     description: >
 *       Requires the token returned by the correct-guess response (`canContinue`). In
 *       "guess-who-next" the just-revealed figure becomes the new chat partner; in
 *       "guess-who" a fresh mystery begins. Rate limited to 10 requests/minute/IP.
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
 *               stream:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: >
 *           JSON result (default), or a text/event-stream of real progress frames when
 *           `stream: true`; identical shape to POST /{game}/start.
 *       400:
 *         description: Missing/invalid/expired token, or Continue called before a correct guess
 *       404:
 *         description: Unknown game
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate the next round
 */
export default gameRoute({ endpoint: "continue", max: 10 }, async (game, req, res) => {
  if (rejectMethod(req, res, ["POST"])) return;

  const stream = req.body?.stream === true;

  const state = verifyGameState(req.body?.[game.tokenField], game.id);
  if (!state) {
    logEvent(
      "info",
      `${game.eventPrefix}_continue_invalid_token`,
      "Rejected an invalid or expired game token",
    );
    res.status(400).json({ error: "Your game session has expired. Please start a new game." });
    return;
  }
  if (state.canContinue !== true) {
    res.status(400).json({ error: "A correct guess is required before continuing." });
    return;
  }

  try {
    const userId = await getSessionUserId(req);
    // The streak was already incremented in the message response to the player but never
    // written back into this token, so recompute it the same way here, from the same
    // trusted source value.
    const newStreak = state.streak + 1;
    const plan = planRound(game, { targetName: state.targetName, usedNames: state.usedNames });
    const round = await generateGameRound(game, plan, startRoundStream(res, stream));

    const token = signGameState(
      roundState(game, plan, round, {
        runId: state.runId,
        streak: newStreak,
        environment: state.environment,
        issuedForUserId: state.issuedForUserId,
        issuedForGuestId: state.issuedForGuestId,
      }),
    );

    logEvent(
      "info",
      `${game.eventPrefix}_continue_round`,
      "Generated the next round after a correct guess",
      sanitizeLogMeta({ streak: newStreak }),
    );
    void recordEvent(`${game.eventPrefix}_round_continued`, { streak: newStreak }, userId);

    sendRoundResult(res, stream, roundResult(game, plan, round, token, newStreak));
  } catch (err) {
    logEvent(
      "error",
      `${game.eventPrefix}_continue_failed`,
      "Failed to generate the next round",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    sendRoundError(res, stream, "Failed to generate the next round");
  }
});
