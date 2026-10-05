/**
 * Every turn of a guessing game's chat, both ordinary questions and guesses at the hidden
 * figure, typed into the same box. Each call classifies whether the player's message is a
 * clear guess, an ambiguous one, a request to give up, or an ordinary question, then responds:
 *
 * - Not a guess: the speaker replies in character as usual.
 * - Ambiguous: the speaker asks the player to confirm what they mean, in character, rather
 *   than guessing on their behalf or answering as if nothing happened.
 * - A clear, correct guess: the hidden figure is revealed and the streak advances. The next
 *   round is deliberately NOT generated here (see continue.ts), so judging stays fast.
 * - A clear, incorrect guess: a first miss is tolerated; a second ends the run and reveals
 *   the hidden figure.
 * - An explicit request to give up: no reply is generated for this turn; the client shows its
 *   own give-up confirmation and, once confirmed, calls give-up.
 *
 * Audio is synthesized for every reply the same way ordinary chat does. No streaming and no
 * server-side message persistence: the client resends its own truncated conversation history
 * each turn, the same pattern pages/api/chat.ts uses for a guest's conversation.
 */

import type { NextApiRequest } from "next";
import { gameRoute, rejectMethod } from "../../../utils/game/route";
import { signGameState, verifyGameState, type GameState } from "../../../utils/game/token";
import {
  isRunEnded,
  markRunEnded,
  recordGameResult,
  scoringIdentity,
  updateHighScoreIfBeaten,
} from "../../../utils/game/scores";
import type { ServerGame } from "../../../utils/game/definitions";
import { recordEvent } from "../../../utils/analytics";
import {
  getGameReply,
  getGuessReactionReply,
  AMBIGUOUS_GUESS_NOTE,
} from "../../../utils/gameReply";
import { classifyGuess } from "../../../utils/classifyGuess";
import { synthesizeReplyAudio } from "../../../utils/ttsReply";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";

/** Input ceilings; a real round's history is a few dozen short lines. */
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ENTRIES = 100;

/** Speaks `text` in the round's speaker voice, returning the audio URL (undefined if TTS fails). */
function speak(game: ServerGame, state: GameState, text: string) {
  return synthesizeReplyAudio(
    text,
    state.speakerName,
    state.gender,
    state.voiceConfig,
    game.hidesSpeaker,
  );
}

/**
 * Next.js API route handler for one turn of a guessing game's chat.
 *
 * @swagger
 * /{game}/message:
 *   post:
 *     summary: Send a question or a guess to the current chat partner
 *     description: >
 *       Verifies the caller's round token (`guessWhoToken` or `gameToken` by game; an
 *       invalid, tampered, expired or other-game token is a 400), classifies whether the
 *       message is a guess at the hidden figure, and responds in character either way. A
 *       correct guess reveals the hidden figure and advances the streak but deliberately does
 *       NOT generate the next round: that is deferred to POST /{game}/continue, called once
 *       the player clicks "Continue". A second wrong guess ends the run. In "guess-who" a
 *       reveal also carries the revealed character's `avatarUrl` and `gender`. Rate limited
 *       to 10 requests/minute/IP.
 *     tags: [Game]
 *     parameters:
 *       - $ref: '#/components/parameters/Game'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               guessWhoToken: { type: string, description: The round token ("guess-who") }
 *               gameToken: { type: string, description: The round token ("guess-who-next") }
 *               message: { type: string }
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
 *                   description: The player asked to give up via chat. No reply/audio this turn; the client shows its own confirmation, then calls /{game}/give-up.
 *                 reply: { type: string }
 *                 audioFileUrl: { type: string }
 *                 correct:
 *                   type: boolean
 *                   description: On true, the client calls POST /{game}/continue (with the returned token) once the player clicks "Continue".
 *                 gameOver: { type: boolean }
 *                 revealedName: { type: string }
 *                 avatarUrl: { type: string, description: '"guess-who" reveals only' }
 *                 gender: { type: string, nullable: true, description: '"guess-who" reveals only' }
 *                 streak: { type: integer }
 *                 finalStreak: { type: integer }
 *                 wrongGuessesRemaining: { type: integer }
 *                 guessWhoToken: { type: string, description: 'Returned (under the game''s own wire name) when the token changed: a correct guess, or a tolerated wrong guess' }
 *                 gameToken: { type: string, description: 'Same, for "guess-who-next"' }
 *       400:
 *         description: Missing message, or invalid/expired round token
 *       404:
 *         description: Unknown game
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to generate a reply
 */
export default gameRoute({ endpoint: "message", max: 10 }, async (game, req, res) => {
  if (rejectMethod(req, res, ["POST"])) return;

  const { message, conversationHistory } = req.body ?? {};

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (
    message.length > MAX_MESSAGE_LENGTH ||
    (Array.isArray(conversationHistory) && conversationHistory.length > MAX_HISTORY_ENTRIES)
  ) {
    res.status(400).json({ error: "Message or history is too long" });
    return;
  }

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

  const history = Array.isArray(conversationHistory)
    ? conversationHistory.filter((entry): entry is string => typeof entry === "string")
    : [];
  const clueRound = Math.floor(history.length / 2) + 1;

  try {
    const classification = await classifyGuess(state.targetName, message, history);

    if (classification.status === "giveUp") {
      logEvent(
        "info",
        `${game.eventPrefix}_give_up_requested_via_chat`,
        "Player asked to give up via chat",
      );
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
        state.targetName,
      );
      res.status(200).json({ reply, audioFileUrl: await speak(game, state, reply) });
      return;
    }

    const userId = await getSessionUserId(req);
    // A hidden-speaker game's reveal also releases the identity every other response withholds.
    const reveal = game.hidesSpeaker ? { avatarUrl: state.avatarUrl, gender: state.gender } : {};

    if (classification.correct) {
      const newStreak = state.streak + 1;
      const scoreWrite = writeScore(game, req, state, userId, newStreak);
      const reply = await getGuessReactionReply(state.personaPrompt, "correct", state.targetName);
      const audioFileUrl = await speak(game, state, reply);
      await scoreWrite;

      logEvent(
        "info",
        `${game.eventPrefix}_guess_correct`,
        "Correct guess, advancing streak",
        sanitizeLogMeta({ streak: newStreak }),
      );
      void recordEvent(
        `${game.eventPrefix}_guess_correct`,
        { streak: newStreak, turn: clueRound },
        userId,
      );

      // Deliberately not generating the next round here; see continue.ts, called once the
      // player clicks "Continue". The token is re-signed with canContinue:true but otherwise
      // unchanged, so continue can still read the target and usedNames from it.
      res.status(200).json({
        reply,
        audioFileUrl,
        [game.tokenField]: signGameState({ ...state, canContinue: true }),
        correct: true,
        gameOver: false,
        revealedName: state.targetName,
        ...reveal,
        streak: newStreak,
      });
      return;
    }

    if (state.wrongGuessCount >= 1) {
      const reply = await getGuessReactionReply(
        state.personaPrompt,
        "finalWrong",
        state.targetName,
      );
      const audioFileUrl = await speak(game, state, reply);
      logEvent(
        "info",
        `${game.eventPrefix}_run_ended`,
        `${game.title} run ended on a second wrong guess`,
        sanitizeLogMeta({ finalStreak: state.streak }),
      );
      void recordEvent(`${game.eventPrefix}_guess_wrong`, { turn: clueRound }, userId);
      const identity = scoringIdentity(req, state, userId);
      if (identity && state.runId) {
        await markRunEnded(game, identity, state.runId, state.streak);
      }
      void recordEvent(
        `${game.eventPrefix}_run_ended`,
        { reason: "second_wrong", finalStreak: state.streak },
        userId,
      );
      res.status(200).json({
        reply,
        audioFileUrl,
        correct: false,
        gameOver: true,
        revealedName: state.targetName,
        ...reveal,
        finalStreak: state.streak,
      });
      return;
    }

    const reply = await getGuessReactionReply(state.personaPrompt, "wrong", state.targetName);
    const audioFileUrl = await speak(game, state, reply);
    // A miss on the very first message is a warm-up: it costs nothing, once per round (the
    // signed flag, not the client-supplied history, stops it repeating).
    const freeMiss = clueRound === 1 && !state.freeMissUsed;
    const newToken = signGameState(
      freeMiss ? { ...state, freeMissUsed: true } : { ...state, wrongGuessCount: 1 },
    );
    void recordEvent(`${game.eventPrefix}_guess_wrong`, { turn: clueRound }, userId);
    res.status(200).json({
      reply,
      audioFileUrl,
      correct: false,
      gameOver: false,
      wrongGuessesRemaining: 1,
      [game.tokenField]: newToken,
    });
  } catch (err) {
    logEvent(
      "error",
      `${game.eventPrefix}_message_failed`,
      `Failed to generate a ${game.title} reply`,
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to generate a reply" });
  }
});

/**
 * Records a correct guess's score. A streak only ever increases within a run, so the moment
 * it's incremented is also the moment it might be a new personal best. A token issued to a
 * guest or another account cannot credit this caller, neither can one from another
 * environment, and neither can a run that was already given up or lost (its old tokens stay
 * decryptable, so this is what stops a revealed answer being replayed as a win). Never
 * throws, and a caller with no identity is simply skipped.
 */
async function writeScore(
  game: ServerGame,
  req: NextApiRequest,
  state: GameState,
  userId: string | null,
  streak: number,
): Promise<void> {
  const identity = scoringIdentity(req, state, userId);
  if (!identity || (state.runId && (await isRunEnded(game, state.runId)))) return;
  await Promise.all([
    identity.userId ? updateHighScoreIfBeaten(game, identity.userId, streak) : undefined,
    state.runId
      ? recordGameResult(
          game,
          identity.userId ?? null,
          identity.guestId ?? null,
          state.runId,
          streak,
        )
      : undefined,
  ]);
}
