/**
 * Builds a guessing-game round for a NAMED character: picks its hidden target (excluding
 * names already met this streak), generates its persona/clue rules, avatar, opening
 * greeting, voice, and TTS audio. This exact 5-call sequence is shared by
 * pages/api/game/start.ts (a run's very first round) and pages/api/game/message.ts's
 * round-advance on a correct guess, so it lives in exactly one place — see CLAUDE.md's
 * "Guessing game" section.
 */

import { pickRandomCharacterName } from "./pickRandomCharacterName";
import { generateGameCluePersonaPrompt } from "../config/serverConfig";
import { getOrGenerateAvatar } from "./avatarGeneration";
import { getOpeningReply } from "./gameReply";
import { getVoiceConfigForCharacter } from "./characterVoices";
import type { CharacterVoiceConfig } from "./characterVoices";
import { synthesizeReplyAudio } from "./ttsReply";

export interface GameRound {
  nextCharacterName: string;
  personaPrompt: string;
  avatarUrl: string;
  voiceGender: string | null;
  voiceConfig: CharacterVoiceConfig;
  reply: string;
  audioFileUrl?: string;
}

/**
 * Generates a full round for `currentCharacterName`, picking a fresh hidden target that
 * excludes every name in `excludeNames`.
 */
export async function generateGameRound(
  currentCharacterName: string,
  excludeNames: string[],
): Promise<GameRound> {
  const nextCharacterName = pickRandomCharacterName(excludeNames);
  const { prompt: personaPrompt } = await generateGameCluePersonaPrompt(
    currentCharacterName,
    nextCharacterName,
  );
  const { avatarUrl, voiceGender } = await getOrGenerateAvatar(currentCharacterName, {
    recognized: true,
  });
  const reply = await getOpeningReply(personaPrompt);
  const voiceConfig = await getVoiceConfigForCharacter(currentCharacterName, voiceGender);
  const audioFileUrl = await synthesizeReplyAudio(
    reply,
    currentCharacterName,
    voiceGender,
    voiceConfig,
  );
  return {
    nextCharacterName,
    personaPrompt,
    avatarUrl,
    voiceGender,
    voiceConfig,
    reply,
    audioFileUrl,
  };
}
