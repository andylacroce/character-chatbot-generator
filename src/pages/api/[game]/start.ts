/**
 * Starts a new run of a guessing game ("guess-who" or "guess-who-next", the `[game]` path
 * segment). Picks the round's characters, generates the speaker's persona, avatar, opening
 * greeting, voice and TTS audio, and wraps the round state into a signed token the client
 * echoes back on every later call. A start costs a personality generation plus an avatar
 * generation combined; since those pipelines run in-process rather than over HTTP, this
 * route's rate limit is the only ceiling on that combined cost.
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
import { signGameState } from "../../../utils/game/token";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { ensureGuestId } from "../../../utils/gameGuestIdentity";
import { getCurrentEnvironment } from "../../../utils/environment";
import { recordEvent } from "../../../utils/analytics";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";

/**
 * Next.js API route handler that starts a new guessing-game run.
 *
 * @swagger
 * /{game}/start:
 *   post:
 *     summary: Start a new guessing-game run
 *     description: >
 *       Generates the first round. In "guess-who" the chat partner is the mystery itself, so
 *       its name and avatar are withheld from every response until a reveal. In
 *       "guess-who-next" the partner is named (`currentCharacterName`, `avatarUrl` and
 *       `gender` are returned) and steers toward a hidden figure that is never returned.
 *       Round state is an opaque, encrypted token (`guessWhoToken` or `gameToken` by game)
 *       the client must echo back on every later call. Rate limited to 10 requests/minute/IP.
 *     tags: [Game]
 *     parameters:
 *       - $ref: '#/components/parameters/Game'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stream:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: >
 *           JSON result (default), or a text/event-stream of real progress frames when
 *           `stream: true`: `data: {"stage": "personality"|"avatar"|"reply"|"voice",
 *           "done": false}` as each step of round generation actually finishes, then a final
 *           frame carrying the same fields as the JSON response plus `"done": true`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 guessWhoToken: { type: string, description: The round token ("guess-who") }
 *                 gameToken: { type: string, description: The round token ("guess-who-next") }
 *                 currentCharacterName: { type: string, description: '"guess-who-next" only' }
 *                 avatarUrl: { type: string, description: '"guess-who-next" only' }
 *                 gender: { type: string, nullable: true, description: '"guess-who-next" only' }
 *                 reply: { type: string }
 *                 audioFileUrl: { type: string }
 *                 streak: { type: integer }
 *           text/event-stream:
 *             schema:
 *               type: string
 *       404:
 *         description: Unknown game
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to start a new run
 */
export default gameRoute({ endpoint: "start", max: 10 }, async (game, req, res) => {
  if (rejectMethod(req, res, ["POST"])) return;

  const stream = req.body?.stream === true;

  try {
    const userId = await getSessionUserId(req);
    const guestId = userId ? null : ensureGuestId(req, res);
    const plan = planRound(game);
    const round = await generateGameRound(game, plan, startRoundStream(res, stream));

    const token = signGameState(
      roundState(game, plan, round, {
        runId: crypto.randomUUID(),
        streak: 0,
        environment: getCurrentEnvironment(),
        issuedForUserId: userId,
        issuedForGuestId: guestId,
      }),
    );

    logEvent(
      "info",
      `${game.eventPrefix}_start_new_run`,
      `Started a new ${game.title} run`,
      sanitizeLogMeta({ streak: 0 }),
    );
    void recordEvent(`${game.eventPrefix}_started`, { guest: !userId }, userId);

    sendRoundResult(res, stream, roundResult(game, plan, round, token, 0));
  } catch (err) {
    logEvent(
      "error",
      `${game.eventPrefix}_start_failed`,
      `Failed to start a new ${game.title} run`,
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    sendRoundError(res, stream, "Failed to start a new run");
  }
});
