/**
 * Builds a "Guess Who" round: picks a hidden name (excluding names already met this
 * streak) and generates its self-describing persona, avatar, opening greeting, voice,
 * and TTS audio — the same pipeline shape as guessWhoNextRound.ts's generateGameRound,
 * except there's only one identity per round (the character chatting IS the mystery),
 * so the avatar/name are generated eagerly for full audio from turn one but must be
 * withheld from the API response until a correct guess or give-up reveals them (see
 * pages/api/guess-who/start.ts, message.ts, continue.ts) — see CLAUDE.md's "Guess Who"
 * section.
 */

import { pickRandomCharacterName } from "./pickRandomCharacterName";
import gameCharacterNames from "../data/gameCharacterNames";
import gameCharacterWork from "../data/gameCharacterWork";
import { generateGuessWhoSelfCluePersonaPrompt } from "../config/serverConfig";
import { getOrGenerateAvatar } from "./avatarGeneration";
import { getOpeningReply, SELF_CLUE_OPENING_INSTRUCTION } from "./guessWhoNextReply";
import { getVoiceConfigForCharacter } from "./characterVoices";
import type { CharacterVoiceConfig } from "./characterVoices";
import { synthesizeReplyAudio } from "./ttsReply";

export interface GuessWhoRound {
  hiddenName: string;
  personaPrompt: string;
  avatarUrl: string;
  gender: string | null;
  voiceConfig: CharacterVoiceConfig;
  reply: string;
  audioFileUrl?: string;
}

/**
 * Fired the instant each named step genuinely finishes — same shape as
 * guessWhoNextRound.ts's GameRoundProgressStage, reused by pages/api/guess-who/start.ts and
 * continue.ts's SSE mode for real progress reporting.
 */
export type GuessWhoRoundProgressStage = "personality" | "avatar" | "reply" | "voice";

/**
 * Generates a full round for a fresh hidden name, excluding every name in
 * `excludeNames`. `onProgress`, when given, is called as each real step completes —
 * purely observational, never changes the result or timing of the work itself.
 */
export async function generateSelfClueRound(
  excludeNames: string[],
  onProgress?: (stage: GuessWhoRoundProgressStage) => void,
): Promise<GuessWhoRound> {
  const hiddenName = pickRandomCharacterName(excludeNames, gameCharacterNames);
  const work = gameCharacterWork[hiddenName];

  // The persona prompt and the avatar each depend only on hiddenName, not on each
  // other, so they run concurrently rather than back-to-back.
  const [{ prompt: personaPrompt }, { avatarUrl, gender }] = await Promise.all([
    generateGuessWhoSelfCluePersonaPrompt(hiddenName, work).then((result) => {
      onProgress?.("personality");
      return result;
    }),
    getOrGenerateAvatar(hiddenName).then((result) => {
      onProgress?.("avatar");
      return result;
    }),
  ]);

  // Likewise, the opening reply only needs personaPrompt and the voice config only needs
  // gender (from the avatar step above) — neither depends on the other's result.
  const [reply, voiceConfig] = await Promise.all([
    getOpeningReply(personaPrompt, SELF_CLUE_OPENING_INSTRUCTION).then((result) => {
      onProgress?.("reply");
      return result;
    }),
    getVoiceConfigForCharacter(hiddenName, gender, personaPrompt).then((result) => {
      onProgress?.("voice");
      return result;
    }),
  ]);

  const audioFileUrl = await synthesizeReplyAudio(reply, hiddenName, gender, voiceConfig);
  return { hiddenName, personaPrompt, avatarUrl, gender, voiceConfig, reply, audioFileUrl };
}
