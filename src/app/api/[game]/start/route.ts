/**
 * Starts a new run of a guessing game ("guess-who" or "guess-who-next", the `[game]` path
 * segment). Picks the round's characters, generates the speaker's persona, avatar, opening
 * greeting, voice and TTS audio, and wraps the round state into a signed token the client
 * echoes back on every later call. A start costs a personality generation plus an avatar
 * generation combined; since those pipelines run in-process rather than over HTTP, this
 * route's rate limit is the only ceiling on that combined cost.
 */

import { readJson } from "../../../../utils/server/withRoute";
import { gameRoute } from "../../../../utils/game/route";
import {
  generateGameRound,
  planRound,
  roundResult,
  roundState,
  roundResponse,
} from "../../../../utils/game/round";
import { signGameState } from "../../../../utils/game/token";
import { getSessionUserId } from "../../../../utils/account/getSessionUserId";
import { ensureGuestId } from "../../../../utils/game/gameGuestIdentity";
import { getCurrentEnvironment } from "../../../../utils/environment";
import { recordEvent } from "../../../../utils/analytics";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";

/**
 * Starts a new guessing-game run.
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
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to start a new run
 */
export const POST = gameRoute({ endpoint: "start", max: 10 }, async (game, req) => {
  const stream = (await readJson(req)).stream === true;
  const userId = await getSessionUserId(req);
  const guest = userId ? null : ensureGuestId(req);

  return roundResponse(
    stream,
    {
      event: `${game.eventPrefix}_start_failed`,
      message: `Failed to start a new ${game.title} run`,
      error: "Failed to start a new run",
    },
    async (onProgress) => {
      const plan = planRound(game);
      const round = await generateGameRound(game, plan, onProgress);

      const token = signGameState(
        roundState(game, plan, round, {
          runId: crypto.randomUUID(),
          streak: 0,
          environment: getCurrentEnvironment(),
          issuedForUserId: userId,
          issuedForGuestId: guest?.guestId ?? null,
        }),
      );

      logEvent(
        "info",
        `${game.eventPrefix}_start_new_run`,
        `Started a new ${game.title} run`,
        sanitizeLogMeta({ streak: 0 }),
      );
      await recordEvent(`${game.eventPrefix}_started`, { guest: !userId }, userId);

      return roundResult(game, plan, round, token, 0);
    },
    guest?.setCookie,
  );
});
