/**
 * Builds one guessing-game round, shared by both games and by the start and continue routes:
 * plans who speaks and who's hidden, then runs the persona, avatar, opening reply, voice and
 * TTS pipeline for the speaker. In "Guess Who's Next" the speaker is a named character
 * steering toward a different hidden one; in "Guess Who" the speaker is the hidden character.
 */

import { pickRandomCharacterName } from "../pickRandomCharacterName";
import gameCharacterNames from "../../data/gameCharacterNames";
import gameCharacterWork from "../../data/gameCharacterWork";
import {
  generateGameCluePersonaPrompt,
  generateGuessWhoSelfCluePersonaPrompt,
} from "../../config/serverConfig";
import { getOrGenerateAvatar } from "../avatarGeneration";
import { getOpeningReply, SELF_CLUE_OPENING_INSTRUCTION } from "../gameReply";
import { getVoiceConfigForCharacter } from "../characterVoices";
import type { CharacterVoiceConfig } from "../characterVoices";
import { synthesizeReplyAudio } from "../ttsReply";
import { setSseHeaders, writeSseFrame } from "../sse";
import type { NextApiResponse } from "next";
import type { ServerGame } from "./definitions";
import type { GameState } from "./token";

export interface GameRoundPlan {
  speakerName: string;
  targetName: string;
  /** Names to exclude from every later pick this streak. */
  usedNames: string[];
}

export interface GameRound {
  personaPrompt: string;
  avatarUrl: string;
  gender: string | null;
  voiceConfig: CharacterVoiceConfig;
  reply: string;
  audioFileUrl?: string;
}

/**
 * Fired the instant each named step genuinely finishes (not on a fixed timer), so a caller's
 * SSE mode can report real progress. `personality`/`avatar` fire in either order (they run
 * concurrently); same for `reply`/`voice`. There's no event for the final TTS step: once the
 * whole function resolves, the caller already has everything.
 */
export type GameRoundProgressStage = "personality" | "avatar" | "reply" | "voice";

/**
 * Decides a round's speaker and target. `prev` is the previous round's target and used
 * names (absent on a run's first round). A shown-speaker game promotes the just-revealed
 * target to speaker and picks a fresh target; a hidden-speaker game simply picks a fresh
 * mystery, which speaks for itself. Names are drawn from the curated game pool only.
 */
export function planRound(
  game: ServerGame,
  prev?: { targetName: string; usedNames: string[] },
): GameRoundPlan {
  const pick = (exclude: string[]) => pickRandomCharacterName(exclude, gameCharacterNames);
  if (game.hidesSpeaker) {
    const mystery = pick(prev?.usedNames ?? []);
    return {
      speakerName: mystery,
      targetName: mystery,
      usedNames: [...(prev?.usedNames ?? []), mystery],
    };
  }
  const speakerName = prev ? prev.targetName : pick([]);
  const usedNames = prev ? [...prev.usedNames, prev.targetName] : [speakerName];
  return { speakerName, targetName: pick(usedNames), usedNames };
}

/**
 * Builds the speaker's system prompt, including the game's clue rules about the target: a
 * hidden speaker describes itself without naming itself; a shown speaker steers toward a
 * different figure. Both are grounded in the curated source-work facts where known.
 */
function buildPersona(game: ServerGame, { speakerName, targetName }: GameRoundPlan) {
  return game.hidesSpeaker
    ? generateGuessWhoSelfCluePersonaPrompt(speakerName, gameCharacterWork[speakerName])
    : generateGameCluePersonaPrompt(speakerName, targetName, {
        current: gameCharacterWork[speakerName],
        next: gameCharacterWork[targetName],
      });
}

/**
 * Generates a full round for the plan's speaker. `onProgress`, when given, is called as each
 * real step completes, purely observational, never changing the result or timing of the work.
 */
export async function generateGameRound(
  game: ServerGame,
  plan: GameRoundPlan,
  onProgress?: (stage: GameRoundProgressStage) => void,
): Promise<GameRound> {
  const { speakerName } = plan;
  // The persona prompt and the avatar each depend only on the speaker, not on each other,
  // so they run concurrently rather than back-to-back.
  const [{ prompt: personaPrompt }, { avatarUrl, gender }] = await Promise.all([
    buildPersona(game, plan).then((result) => {
      onProgress?.("personality");
      return result;
    }),
    getOrGenerateAvatar(speakerName).then((result) => {
      onProgress?.("avatar");
      return result;
    }),
  ]);

  // Likewise, the opening reply only needs the persona and the voice config only needs the
  // gender (from the avatar step above), neither depends on the other's result.
  const [reply, voiceConfig] = await Promise.all([
    getOpeningReply(
      personaPrompt,
      // Only the hidden-speaker game replaces the default "introduce yourself" opening,
      // which would otherwise have it state its own name.
      game.hidesSpeaker ? SELF_CLUE_OPENING_INSTRUCTION : undefined,
      plan.targetName,
    ).then((result) => {
      onProgress?.("reply");
      return result;
    }),
    getVoiceConfigForCharacter(speakerName, gender, personaPrompt).then((result) => {
      onProgress?.("voice");
      return result;
    }),
  ]);

  const audioFileUrl = await synthesizeReplyAudio(reply, speakerName, gender, voiceConfig);
  return { personaPrompt, avatarUrl, gender, voiceConfig, reply, audioFileUrl };
}

/** The per-run fields a round's token carries over from the previous token (or sets fresh at start). */
export type RoundTokenCarry = Pick<
  GameState,
  "runId" | "streak" | "environment" | "issuedForUserId" | "issuedForGuestId"
>;

/** Assembles the token state for a freshly generated round: no wrong guesses yet, not yet continuable. */
export function roundState(
  game: ServerGame,
  plan: GameRoundPlan,
  round: GameRound,
  carry: RoundTokenCarry,
): GameState {
  return {
    game: game.id,
    speakerName: plan.speakerName,
    targetName: plan.targetName,
    personaPrompt: round.personaPrompt,
    avatarUrl: round.avatarUrl,
    gender: round.gender,
    voiceConfig: round.voiceConfig,
    usedNames: plan.usedNames,
    wrongGuessCount: 0,
    canContinue: false,
    ...carry,
  };
}

/**
 * The start/continue response body. The token goes under the game's wire name; the speaker's
 * identity is included only for a game that shows its chat partner, since in a hidden-speaker
 * game the name and avatar must stay inside the token until a reveal.
 */
export function roundResult(
  game: ServerGame,
  plan: GameRoundPlan,
  round: GameRound,
  token: string,
  streak: number,
): Record<string, unknown> {
  return {
    [game.tokenField]: token,
    ...(game.hidesSpeaker
      ? {}
      : {
          currentCharacterName: plan.speakerName,
          avatarUrl: round.avatarUrl,
          gender: round.gender,
        }),
    reply: round.reply,
    audioFileUrl: round.audioFileUrl,
    streak,
  };
}

/** Switches a response to SSE and returns the `onProgress` callback that reports real stages. */
export function startRoundStream(res: NextApiResponse, stream: boolean) {
  if (!stream) return undefined;
  setSseHeaders(res);
  return (stage: GameRoundProgressStage) => writeSseFrame(res, { stage, done: false });
}

/** Sends a round result as the JSON body, or as the final SSE frame when streaming. */
export function sendRoundResult(
  res: NextApiResponse,
  stream: boolean,
  result: Record<string, unknown>,
): void {
  if (stream) {
    writeSseFrame(res, { ...result, done: true });
    res.end();
    return;
  }
  res.status(200).json(result);
}

/** Sends a round-generation failure in whichever mode the response is already in. */
export function sendRoundError(res: NextApiResponse, stream: boolean, error: string): void {
  if (stream) {
    writeSseFrame(res, { error, done: true });
    res.end();
    return;
  }
  res.status(500).json({ error });
}
