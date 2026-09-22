/**
 * API endpoint that generates the NEXT character after a correct guess. Deliberately
 * separate from /game/message's guess-judging response (see that file's own doc comment)
 * so judging a guess stays fast — the player sees "Correct!" immediately — while the
 * persona+avatar+voice+reply+TTS pipeline for the newly-revealed character only runs once
 * they actually click "Continue" client-side. Shares the exact same generateGameRound
 * pipeline, request/response shape, and SSE streaming/staged-progress UX as /game/start,
 * since generating a round for a newly-revealed character is the same underlying
 * operation as starting one — see CLAUDE.md's "Guessing game" section.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { generateGameRound } from "../../../src/utils/gameRound";
import { verifyGameState, signGameState } from "../../../src/utils/gameToken";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { recordEvent } from "../../../src/utils/analytics";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import { withRequestLog } from "../../../src/utils/withRequestLog";
import { setSseHeaders, writeSseFrame } from "../../../src/utils/sse";

/** Rate limiter: 10 requests per minute per IP, same tier as the other game endpoints. */
const gameContinueRateLimit = createRateLimiter({
  name: "game-continue",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler that generates the next round after a correct guess.
 *
 * @swagger
 * /game/continue:
 *   post:
 *     summary: Generate the next character after a correct guess
 *     description: >
 *       Called once the player clicks "Continue" following a correct guess (see
 *       /game/message, which deliberately doesn't generate this itself). Reads the
 *       still-valid `gameToken` from that guess to recover the newly-revealed character
 *       (its `nextCharacterName`) and the streak's `usedNames`, then runs the same
 *       persona+avatar+voice+reply+TTS pipeline /game/start uses to generate that
 *       character's own round, including a fresh hidden target for them. Rejects an
 *       invalid/tampered/expired `gameToken` with 400. Rate limited to 10
 *       requests/minute/IP.
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
 *               stream:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: >
 *           JSON result (default), or a text/event-stream of real progress frames when
 *           `stream: true` — identical shape to POST /game/start's streamed response.
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
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Missing/invalid/expired game token
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate the next round
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(gameContinueRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { gameToken } = req.body ?? {};
  const stream = req.body?.stream === true;

  const state = verifyGameState(gameToken);
  if (!state) {
    logEvent("info", "game_continue_invalid_token", "Rejected an invalid or expired game token");
    res.status(400).json({ error: "Your game session has expired. Please start a new game." });
    return;
  }
  if (state.canContinue !== true) {
    res.status(400).json({ error: "A correct guess is required before continuing." });
    return;
  }

  try {
    const userId = await getSessionUserId(req);
    // The streak was already incremented in /game/message's response to the player, but
    // never written back into this token (see that handler's doc comment) — recompute it
    // the same way here, from the same trusted source value.
    const newStreak = state.streak + 1;
    const revealedName = state.nextCharacterName;
    const newUsedNames = [...state.usedNames, revealedName];

    if (stream) {
      setSseHeaders(res);
    }

    const {
      nextCharacterName,
      personaPrompt,
      avatarUrl,
      gender,
      voiceConfig,
      reply,
      audioFileUrl,
    } = await generateGameRound(
      revealedName,
      newUsedNames,
      stream ? (stage) => writeSseFrame(res, { stage, done: false }) : undefined,
    );

    const newToken = signGameState({
      runId: state.runId,
      currentCharacterName: revealedName,
      nextCharacterName,
      personaPrompt,
      avatarUrl,
      gender,
      voiceConfig,
      usedNames: newUsedNames,
      streak: newStreak,
      wrongGuessCount: 0,
      environment: state.environment,
      issuedForUserId: state.issuedForUserId,
      issuedForGuestId: state.issuedForGuestId,
      canContinue: false,
    });

    logEvent(
      "info",
      "game_continue_round",
      "Generated the next round after a correct guess",
      sanitizeLogMeta({ streak: newStreak }),
    );
    void recordEvent("game_round_continued", { streak: newStreak }, userId);

    const result = {
      gameToken: newToken,
      currentCharacterName: revealedName,
      avatarUrl,
      gender,
      reply,
      audioFileUrl,
      streak: newStreak,
    };
    if (stream) {
      writeSseFrame(res, { ...result, done: true });
      res.end();
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    logEvent(
      "error",
      "game_continue_failed",
      "Failed to generate the next round",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    if (stream) {
      writeSseFrame(res, { error: "Failed to generate the next round", done: true });
      res.end();
      return;
    }
    res.status(500).json({ error: "Failed to generate the next round" });
  }
}

export default withRequestLog(handler);
