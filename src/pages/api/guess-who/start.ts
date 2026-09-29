/**
 * API endpoint that starts (or continues) a "Guess Who" run: picks a hidden character
 * (excluding names already met this streak) and generates its 5 ordered clues via a
 * single fast Claude call. No avatar, voice, or persona here — deliberately cheaper than
 * "Guess Who's Next" (see CLAUDE.md's "Second game mode" plan) since there's no chat, no
 * TTS, and the hidden character's avatar is only ever generated at the reveal moment
 * (POST /guess-who/guess on a correct answer, or /guess-who/give-up), never during the
 * clue phase, so it can never spoil the guess.
 *
 * Reused for BOTH a run's first round (empty `usedNames`/`streak`) and every round after
 * a correct guess (the client passes the current `usedNames`/`streak` forward from the
 * guess response) — there's no separate /continue endpoint, unlike "Guess Who's Next",
 * since round generation here is a single fast call rather than a multi-stage pipeline.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { generateGuessWhoRound } from "../../../utils/guessWhoRound";
import { signGuessWhoState } from "../../../utils/guessWhoToken";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { ensureGuestId } from "../../../utils/gameGuestIdentity";
import { getCurrentEnvironment } from "../../../utils/environment";
import { recordEvent } from "../../../utils/analytics";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";

/** Rate limiter: 10 requests per minute per IP, same tier as guess-who-next-start. */
const guessWhoStartRateLimit = createRateLimiter({
  name: "guess-who-start",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler that starts or continues a "Guess Who" run.
 *
 * @swagger
 * /guess-who/start:
 *   post:
 *     summary: Start a new "Guess Who" round, or the next round after a correct guess
 *     description: >
 *       Picks a hidden character (excluding `usedNames`) and generates its 5 ordered
 *       clues. Round state is an opaque, encrypted `guessWhoToken` the client must echo
 *       back on every subsequent /guess-who/guess or /guess-who/give-up call. Rate
 *       limited to 10 requests/minute/IP.
 *     tags: [GuessWho]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               usedNames:
 *                 type: array
 *                 items: { type: string }
 *               streak:
 *                 type: integer
 *     responses:
 *       200:
 *         description: A new round started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 guessWhoToken: { type: string }
 *                 clue: { type: string }
 *                 clueNumber: { type: integer }
 *                 totalClues: { type: integer }
 *                 streak: { type: integer }
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to start a new round
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(guessWhoStartRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const usedNames: string[] = Array.isArray(req.body?.usedNames)
    ? req.body.usedNames.filter((name: unknown): name is string => typeof name === "string")
    : [];
  const streak = typeof req.body?.streak === "number" && req.body.streak > 0 ? req.body.streak : 0;
  const isNewRun = usedNames.length === 0;

  try {
    const userId = await getSessionUserId(req);
    const guestId = userId ? null : ensureGuestId(req, res);
    const { hiddenName, clues } = await generateGuessWhoRound(usedNames);

    const runId = crypto.randomUUID();
    const guessWhoToken = signGuessWhoState({
      runId,
      hiddenName,
      clues,
      revealedCount: 1,
      usedNames: [...usedNames, hiddenName],
      streak,
      environment: getCurrentEnvironment(),
      issuedForUserId: userId,
      issuedForGuestId: guestId,
    });

    if (isNewRun) {
      logEvent("info", "guess_who_start_new_run", "Started a new Guess Who run");
      void recordEvent("guess_who_started", { guest: !userId }, userId);
    }

    res.status(200).json({
      guessWhoToken,
      clue: clues[0],
      clueNumber: 1,
      totalClues: clues.length,
      streak,
    });
  } catch (err) {
    logEvent(
      "error",
      "guess_who_start_failed",
      "Failed to start a Guess Who round",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to start a new round" });
  }
}

export default withRequestLog(handler);
