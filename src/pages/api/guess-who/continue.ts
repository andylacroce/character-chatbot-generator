/**
 * API endpoint that generates the NEXT round after a correct guess. Deliberately
 * separate from /guess-who/message's guess-judging response (see that file's own doc
 * comment) so judging a guess stays fast — the player sees "Correct!" immediately —
 * while the persona+avatar+voice+reply+TTS pipeline for the newly-hidden character only
 * runs once they actually click "Continue" client-side. Mirrors
 * pages/api/guess-who-next/continue.ts's shape exactly.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { generateSelfClueRound } from "../../../utils/guessWhoRound";
import { verifyGuessWhoState, signGuessWhoState } from "../../../utils/guessWhoToken";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { recordEvent } from "../../../utils/analytics";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";
import { setSseHeaders, writeSseFrame } from "../../../utils/sse";

/** Rate limiter: 10 requests per minute per IP, same tier as the other Guess Who endpoints. */
const guessWhoContinueRateLimit = createRateLimiter({
  name: "guess-who-continue",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler that generates the next round after a correct guess.
 *
 * @swagger
 * /guess-who/continue:
 *   post:
 *     summary: Generate the next hidden character after a correct guess
 *     description: >
 *       Called once the player clicks "Continue" following a correct guess (see
 *       /guess-who/message, which deliberately doesn't generate this itself). Reads the
 *       still-valid `guessWhoToken` to recover the streak's `usedNames`, then runs the
 *       same persona+avatar+voice+reply+TTS pipeline /guess-who/start uses to generate a
 *       fresh hidden character's round. Rejects an invalid/tampered/expired
 *       `guessWhoToken` with 400. Rate limited to 10 requests/minute/IP.
 *     tags: [GuessWho]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [guessWhoToken]
 *             properties:
 *               guessWhoToken:
 *                 type: string
 *               stream:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: >
 *           JSON result (default), or a text/event-stream of real progress frames when
 *           `stream: true` — identical shape to POST /guess-who/start's streamed response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 guessWhoToken:
 *                   type: string
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
 *         description: Missing/invalid/expired game token, or Continue called before a correct guess
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate the next round
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(guessWhoContinueRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { guessWhoToken } = req.body ?? {};
  const stream = req.body?.stream === true;

  const state = verifyGuessWhoState(guessWhoToken);
  if (!state) {
    logEvent(
      "info",
      "guess_who_continue_invalid_token",
      "Rejected an invalid or expired Guess Who token",
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
    // The streak was already incremented in /guess-who/message's response to the
    // player, but never written back into this token — recompute it the same way here,
    // from the same trusted source value.
    const newStreak = state.streak + 1;
    const newUsedNames = [...state.usedNames];

    if (stream) {
      setSseHeaders(res);
    }

    const { hiddenName, personaPrompt, avatarUrl, gender, voiceConfig, reply, audioFileUrl } =
      await generateSelfClueRound(
        newUsedNames,
        stream ? (stage) => writeSseFrame(res, { stage, done: false }) : undefined,
      );

    const newToken = signGuessWhoState({
      runId: state.runId,
      hiddenName,
      personaPrompt,
      avatarUrl,
      gender,
      voiceConfig,
      usedNames: [...newUsedNames, hiddenName],
      streak: newStreak,
      wrongGuessCount: 0,
      environment: state.environment,
      issuedForUserId: state.issuedForUserId,
      issuedForGuestId: state.issuedForGuestId,
      canContinue: false,
    });

    logEvent(
      "info",
      "guess_who_continue_round",
      "Generated the next Guess Who round after a correct guess",
      sanitizeLogMeta({ streak: newStreak }),
    );
    void recordEvent("guess_who_round_continued", { streak: newStreak }, userId);

    const result = { guessWhoToken: newToken, reply, audioFileUrl, streak: newStreak };
    if (stream) {
      writeSseFrame(res, { ...result, done: true });
      res.end();
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    logEvent(
      "error",
      "guess_who_continue_failed",
      "Failed to generate the next Guess Who round",
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
