/**
 * API endpoint for every turn of "Guess Who"'s chat, both ordinary questions and guesses
 * at the mystery character's own identity, typed into the same box (see CLAUDE.md's
 * "Guess Who" section). Each call classifies whether the player's message is a clear
 * guess attempt, an ambiguous one, or an ordinary question, then responds accordingly:
 *
 * - Not a guess: the hidden character replies in character as usual, still never naming
 *   itself.
 * - Ambiguous: the character asks the player to confirm what they mean, in character.
 * - A clear, correct guess: the character's identity (name + avatar) is revealed and the
 *   streak advances.
 * - A clear, incorrect guess: a first miss is tolerated; a second ends the run and
 *   reveals the character.
 * - An explicit request to give up: no reply is generated for this turn; the client
 *   shows its own give-up confirmation and, once confirmed, calls /guess-who/give-up.
 *
 * Mirrors pages/api/guess-who-next/message.ts's shape exactly, except there's only one
 * identity per round (the character chatting IS the mystery, not a different hidden
 * target it's steering toward), so a correct guess or second wrong guess must also
 * release the avatar/name this response otherwise always withholds.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { verifyGuessWhoState, signGuessWhoState } from "../../../utils/guessWhoToken";
import { updateHighScoreIfBeaten } from "../../../utils/guessWhoHighScore";
import { recordGuessWhoResult } from "../../../utils/guessWhoLeaderboard";
import { getCurrentEnvironment } from "../../../utils/environment";
import { getGuestId } from "../../../utils/gameGuestIdentity";
import { recordEvent } from "../../../utils/analytics";
import {
  getGameReply,
  getGuessReactionReply,
  AMBIGUOUS_GUESS_NOTE,
} from "../../../utils/guessWhoNextReply";
import { classifyGuess } from "../../../utils/classifyGuess";
import { synthesizeReplyAudio } from "../../../utils/ttsReply";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";

/** Rate limiter: 10 requests per minute per IP, same tier as guess-who-next-message. */
const guessWhoMessageRateLimit = createRateLimiter({
  name: "guess-who-message",
  max: 10,
  message: "Too many game requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for one turn of "Guess Who"'s chat.
 *
 * @swagger
 * /guess-who/message:
 *   post:
 *     summary: Send a question or a guess to the hidden character
 *     description: >
 *       Verifies the caller's `guessWhoToken` (rejecting an invalid/tampered/expired one
 *       with 400), classifies whether the message is a guess at the character's own
 *       hidden identity, and responds in character either way. A correct guess or a
 *       second wrong guess reveals the character's name and avatar. On a correct guess,
 *       the client should call POST /guess-who/continue (with the same guessWhoToken)
 *       once the player clicks "Continue" to generate the next round. Rate limited to 10
 *       requests/minute/IP.
 *     tags: [GuessWho]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [guessWhoToken, message]
 *             properties:
 *               guessWhoToken:
 *                 type: string
 *               message:
 *                 type: string
 *               conversationHistory:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: The reply, plus guess-outcome fields when the message was judged as a guess
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 giveUpRequested:
 *                   type: boolean
 *                 reply:
 *                   type: string
 *                 audioFileUrl:
 *                   type: string
 *                 correct:
 *                   type: boolean
 *                 gameOver:
 *                   type: boolean
 *                 revealedName:
 *                   type: string
 *                 avatarUrl:
 *                   type: string
 *                 gender:
 *                   type: string
 *                   nullable: true
 *                 streak:
 *                   type: integer
 *                 finalStreak:
 *                   type: integer
 *                 wrongGuessesRemaining:
 *                   type: integer
 *                 guessWhoToken:
 *                   type: string
 *       400:
 *         description: Missing message, or invalid/expired game token
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate a reply
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(guessWhoMessageRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { guessWhoToken, message, conversationHistory } = req.body ?? {};

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const state = verifyGuessWhoState(guessWhoToken);
  if (!state) {
    logEvent("info", "guess_who_invalid_token", "Rejected an invalid or expired Guess Who token");
    res.status(400).json({ error: "Your game session has expired. Please start a new game." });
    return;
  }

  const history = Array.isArray(conversationHistory)
    ? conversationHistory.filter((entry): entry is string => typeof entry === "string")
    : [];
  const clueRound = Math.floor(history.length / 2) + 1;

  try {
    const classification = await classifyGuess(state.hiddenName, message, history);

    if (classification.status === "giveUp") {
      logEvent("info", "guess_who_give_up_requested_via_chat", "Player asked to give up via chat");
      res.status(200).json({ giveUpRequested: true });
      return;
    }

    if (classification.status !== "clear") {
      const reply = await getGameReply(
        state.personaPrompt,
        history,
        message,
        clueRound,
        classification.status === "ambiguous" ? AMBIGUOUS_GUESS_NOTE : undefined,
      );
      const audioFileUrl = await synthesizeReplyAudio(
        reply,
        state.hiddenName,
        state.gender,
        state.voiceConfig,
      );
      res.status(200).json({ reply, audioFileUrl });
      return;
    }

    const userId = await getSessionUserId(req);

    if (classification.correct) {
      const revealedName = state.hiddenName;
      const newStreak = state.streak + 1;
      // Fire-and-forget: a streak only ever increases within a run, so the moment it's
      // incremented is also the moment it might be a new personal best. A token issued
      // to a guest or another account cannot credit this account.
      const eligibleUserId =
        userId && state.issuedForUserId === userId && state.environment === getCurrentEnvironment()
          ? userId
          : null;
      const eligibleGuestId =
        !userId &&
        state.issuedForGuestId &&
        state.issuedForGuestId === getGuestId(req) &&
        state.environment === getCurrentEnvironment()
          ? state.issuedForGuestId
          : null;
      const scoreWrite = Promise.all([
        eligibleUserId ? updateHighScoreIfBeaten(eligibleUserId, newStreak) : Promise.resolve(),
        eligibleUserId || eligibleGuestId
          ? recordGuessWhoResult(eligibleUserId, eligibleGuestId, state.runId, newStreak)
          : Promise.resolve(),
      ]);
      const reactionReply = await getGuessReactionReply(state.personaPrompt, "correct", revealedName);
      const reactionAudioFileUrl = await synthesizeReplyAudio(
        reactionReply,
        state.hiddenName,
        state.gender,
        state.voiceConfig,
      );
      await scoreWrite;

      logEvent(
        "info",
        "guess_who_guess_correct",
        "Correct guess, advancing streak",
        sanitizeLogMeta({ streak: newStreak }),
      );
      void recordEvent("guess_who_guess_correct", { streak: newStreak }, userId);

      // Deliberately not generating the next round here — see pages/api/guess-who/continue.ts,
      // called once the player clicks "Continue". The existing guessWhoToken is
      // re-signed with canContinue:true but otherwise unchanged, so /guess-who/continue
      // can still read state.hiddenName/usedNames from it.
      res.status(200).json({
        reply: reactionReply,
        audioFileUrl: reactionAudioFileUrl,
        guessWhoToken: signGuessWhoState({ ...state, canContinue: true }),
        correct: true,
        gameOver: false,
        revealedName,
        avatarUrl: state.avatarUrl,
        gender: state.gender,
        streak: newStreak,
      });
      return;
    }

    if (state.wrongGuessCount >= 1) {
      const revealedName = state.hiddenName;
      const reactionReply = await getGuessReactionReply(
        state.personaPrompt,
        "finalWrong",
        revealedName,
      );
      const audioFileUrl = await synthesizeReplyAudio(
        reactionReply,
        state.hiddenName,
        state.gender,
        state.voiceConfig,
      );
      logEvent(
        "info",
        "guess_who_run_ended",
        "Guess Who run ended on a second wrong guess",
        sanitizeLogMeta({ finalStreak: state.streak }),
      );
      void recordEvent("guess_who_guess_wrong", undefined, userId);
      void recordEvent(
        "guess_who_run_ended",
        { reason: "second_wrong", finalStreak: state.streak },
        userId,
      );
      res.status(200).json({
        reply: reactionReply,
        audioFileUrl,
        correct: false,
        gameOver: true,
        revealedName,
        avatarUrl: state.avatarUrl,
        gender: state.gender,
        finalStreak: state.streak,
      });
      return;
    }

    const reactionReply = await getGuessReactionReply(state.personaPrompt, "wrong", state.hiddenName);
    const audioFileUrl = await synthesizeReplyAudio(
      reactionReply,
      state.hiddenName,
      state.gender,
      state.voiceConfig,
    );
    const newToken = signGuessWhoState({ ...state, wrongGuessCount: 1 });
    void recordEvent("guess_who_guess_wrong", undefined, userId);
    res.status(200).json({
      reply: reactionReply,
      audioFileUrl,
      correct: false,
      gameOver: false,
      wrongGuessesRemaining: 1,
      guessWhoToken: newToken,
    });
  } catch (err) {
    logEvent(
      "error",
      "guess_who_message_failed",
      "Failed to generate a Guess Who reply",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to generate a reply" });
  }
}

export default withRequestLog(handler);
