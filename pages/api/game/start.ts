/**
 * API endpoint that starts a new guessing-game run: picks a random, NAMED character for
 * the player to chat with, plus a second, HIDDEN character that one is instructed to
 * steer the conversation toward, and returns the named character's opening greeting —
 * never the hidden name. Audio is synthesized for the greeting the same way ordinary
 * chat does, so the game has audio parity with the main app. All of this is wrapped
 * into a signed game token the client echoes back on every subsequent
 * /api/game/message call. See CLAUDE.md's "Guessing game" section for the overall
 * chain-guessing design.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { pickRandomCharacterName } from "../../../src/utils/pickRandomCharacterName";
import { generateGameRound } from "../../../src/utils/gameRound";
import { signGameState } from "../../../src/utils/gameToken";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { getCurrentEnvironment } from "../../../src/utils/environment";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import { withRequestLog } from "../../../src/utils/withRequestLog";

/**
 * Rate limiter: 10 requests per minute per IP. A run start costs a personality
 * generation plus an avatar generation combined — since it calls those pipelines
 * in-process (see src/utils/avatarGeneration.ts) rather than over HTTP, this limiter is
 * the only ceiling on that combined cost, unlike bot creation's independently-throttled
 * /generate-personality + /generate-avatar calls.
 */
const gameStartRateLimit = createRateLimiter({
  name: "game-start",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler that starts a new guessing-game run.
 *
 * @swagger
 * /game/start:
 *   post:
 *     summary: Start a new guessing-game run
 *     description: >
 *       Picks a random, named character for the player to chat with (revealed — its
 *       name/avatar are returned directly) plus a hidden second character it steers the
 *       conversation toward (never returned). Round state is an opaque, encrypted
 *       `gameToken` the client must echo back on every subsequent /game/message or
 *       /game/guess call. Rate limited to 10 requests/minute/IP.
 *     tags: [Game]
 *     responses:
 *       200:
 *         description: A new run has started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gameToken:
 *                   type: string
 *                 currentCharacterName:
 *                   type: string
 *                 avatarUrl:
 *                   type: string
 *                 gender:
 *                   type: string
 *                   nullable: true
 *                 reply:
 *                   type: string
 *                 audioFileUrl:
 *                   type: string
 *                 streak:
 *                   type: integer
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to start a new run
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(gameStartRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  try {
    const userId = await getSessionUserId(req, res);
    const currentCharacterName = pickRandomCharacterName();
    const {
      nextCharacterName,
      personaPrompt,
      avatarUrl,
      gender,
      voiceConfig,
      reply,
      audioFileUrl,
    } = await generateGameRound(currentCharacterName, [currentCharacterName]);

    const gameToken = signGameState({
      currentCharacterName,
      nextCharacterName,
      personaPrompt,
      avatarUrl,
      gender,
      voiceConfig,
      usedNames: [currentCharacterName],
      streak: 0,
      wrongGuessCount: 0,
      environment: getCurrentEnvironment(),
      issuedForUserId: userId,
    });

    logEvent(
      "info",
      "game_start_new_run",
      "Started a new guessing-game run",
      sanitizeLogMeta({ streak: 0 }),
    );

    res.status(200).json({
      gameToken,
      currentCharacterName,
      avatarUrl,
      gender,
      reply,
      audioFileUrl,
      streak: 0,
    });
  } catch (err) {
    logEvent(
      "error",
      "game_start_failed",
      "Failed to start a new guessing-game run",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to start a new run" });
  }
}

export default withRequestLog(handler);
