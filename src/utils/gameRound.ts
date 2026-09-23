/**
 * Builds a guessing-game round for a NAMED character: picks its hidden target (excluding
 * names already met this streak), generates its persona/clue rules, avatar, opening
 * greeting, voice, and TTS audio. This exact 5-call sequence is shared by
 * pages/api/game/start.ts (a run's very first round) and pages/api/game/message.ts's
 * round-advance on a correct guess, so it lives in exactly one place — see CLAUDE.md's
 * "Guessing game" section.
 */

import { pickRandomCharacterName } from "./pickRandomCharacterName";
import gameCharacterNames from "../data/gameCharacterNames";
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
  gender: string | null;
  voiceConfig: CharacterVoiceConfig;
  reply: string;
  audioFileUrl?: string;
}

/**
 * Fired the instant each named step genuinely finishes — not on a fixed timer — so a
 * caller (pages/api/game/start.ts's SSE mode) can report real progress to the client
 * instead of a client-side simulation. `personality`/`avatar` fire in either order (they
 * run concurrently); same for `reply`/`voice`. There's no event for the final TTS
 * synthesis step: once the whole function resolves, the caller already has everything.
 */
export type GameRoundProgressStage = "personality" | "avatar" | "reply" | "voice";

/**
 * Generates a full round for `currentCharacterName`, picking a fresh hidden target that
 * excludes every name in `excludeNames`. `onProgress`, when given, is called as each real
 * step completes (see GameRoundProgressStage) — purely observational, never changes the
 * result or timing of the work itself.
 */
export async function generateGameRound(
  currentCharacterName: string,
  excludeNames: string[],
  onProgress?: (stage: GameRoundProgressStage) => void,
): Promise<GameRound> {
  const nextCharacterName = pickRandomCharacterName(excludeNames, gameCharacterNames);

  // The persona prompt and the avatar each depend only on currentCharacterName, not on
  // each other, so they run concurrently rather than back-to-back.
  const [{ prompt: personaPrompt }, { avatarUrl, gender }] = await Promise.all([
    generateGameCluePersonaPrompt(currentCharacterName, nextCharacterName).then((result) => {
      onProgress?.("personality");
      return result;
    }),
    getOrGenerateAvatar(currentCharacterName, { recognized: true }).then((result) => {
      onProgress?.("avatar");
      return result;
    }),
  ]);

  // Likewise, the opening reply only needs personaPrompt and the voice config only needs
  // gender (from the avatar step above) — neither depends on the other's result.
  const [reply, voiceConfig] = await Promise.all([
    getOpeningReply(personaPrompt).then((result) => {
      onProgress?.("reply");
      return result;
    }),
    getVoiceConfigForCharacter(currentCharacterName, gender, personaPrompt).then((result) => {
      onProgress?.("voice");
      return result;
    }),
  ]);

  const audioFileUrl = await synthesizeReplyAudio(reply, currentCharacterName, gender, voiceConfig);
  return { nextCharacterName, personaPrompt, avatarUrl, gender, voiceConfig, reply, audioFileUrl };
}
