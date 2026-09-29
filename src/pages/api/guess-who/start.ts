/**
 * API endpoint that starts a new "Guess Who" run: picks a hidden character and generates
 * its self-describing persona, avatar, opening greeting, voice, and TTS audio — full
 * audio parity with ordinary chat from turn one. The name and avatar are withheld from
 * this response (and every other response until a reveal) — they live only inside the
 * encrypted `guessWhoToken`, never sent to the client while the round is live. See
 * CLAUDE.md's "Guess Who" section.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { generateSelfClueRound } from "../../../utils/guessWhoRound";
import { signGuessWhoState } from "../../../utils/guessWhoToken";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { ensureGuestId } from "../../../utils/gameGuestIdentity";
import { getCurrentEnvironment } from "../../../utils/environment";
import { recordEvent } from "../../../utils/analytics";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";
import { setSseHeaders, writeSseFrame } from "../../../utils/sse";

/**
 * Rate limiter: 10 requests per minute per IP. A run start costs a personality
 * generation plus an avatar generation combined, same reasoning as guess-who-next-start.
 */
const guessWhoStartRateLimit = createRateLimiter({
  name: "guess-who-start",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler that starts a new "Guess Who" run.
 *
 * @swagger
 * /guess-who/start:
 *   post:
 *     summary: Start a new "Guess Who" round
 *     description: >
 *       Picks a hidden character and generates its persona, avatar, opening greeting,
 *       voice, and TTS audio. The name and avatar are NOT returned here — they live only
 *       inside the opaque, encrypted `guessWhoToken`, which the client must echo back on
 *       every subsequent /guess-who/message, /guess-who/continue, or /guess-who/give-up
 *       call. Rate limited to 10 requests/minute/IP.
 *     tags: [GuessWho]
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
 *           `stream: true` — `data: {"stage": "personality"|"avatar"|"reply"|"voice",
 *           "done": false}` fired the instant each named step actually finishes, followed
 *           by a final frame carrying the same fields as the JSON response plus
 *           `"done": true`.
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

  const stream = req.body?.stream === true;

  try {
    const userId = await getSessionUserId(req);
    const guestId = userId ? null : ensureGuestId(req, res);

    if (stream) {
      setSseHeaders(res);
    }

    const { hiddenName, personaPrompt, avatarUrl, gender, voiceConfig, reply, audioFileUrl } =
      await generateSelfClueRound(
        [],
        stream ? (stage) => writeSseFrame(res, { stage, done: false }) : undefined,
      );

    const runId = crypto.randomUUID();
    const guessWhoToken = signGuessWhoState({
      runId,
      hiddenName,
      personaPrompt,
      avatarUrl,
      gender,
      voiceConfig,
      usedNames: [hiddenName],
      streak: 0,
      wrongGuessCount: 0,
      environment: getCurrentEnvironment(),
      issuedForUserId: userId,
      issuedForGuestId: guestId,
      canContinue: false,
    });

    logEvent("info", "guess_who_start_new_run", "Started a new Guess Who run");
    void recordEvent("guess_who_started", { guest: !userId }, userId);

    const result = { guessWhoToken, reply, audioFileUrl, streak: 0 };
    if (stream) {
      writeSseFrame(res, { ...result, done: true });
      res.end();
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    logEvent(
      "error",
      "guess_who_start_failed",
      "Failed to start a new Guess Who run",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    if (stream) {
      writeSseFrame(res, { error: "Failed to start a new round", done: true });
      res.end();
      return;
    }
    res.status(500).json({ error: "Failed to start a new round" });
  }
}

export default withRequestLog(handler);
