/**
 * Builds one "Guess Who" round: picks a hidden name (excluding names already met this
 * streak) and generates its 5 ordered clues. Deliberately a single fast Claude call —
 * unlike "Guess Who's Next" (guessWhoNextRound.ts), there's no persona, avatar, TTS, or
 * voice config here; an avatar is only ever generated at the reveal moment (a correct
 * guess or give-up), never during the clue phase, so it can never spoil the guess — see
 * CLAUDE.md's "Second game mode" plan.
 */

import { pickRandomCharacterName } from "./pickRandomCharacterName";
import gameCharacterNames from "../data/gameCharacterNames";
import gameCharacterWork from "../data/gameCharacterWork";
import { generateCharacterClues } from "../config/serverConfig";

export interface GuessWhoRound {
  hiddenName: string;
  clues: string[];
}

/**
 * Picks a fresh hidden name (excluding `excludeNames`) and generates its 5 clues.
 */
export async function generateGuessWhoRound(excludeNames: string[]): Promise<GuessWhoRound> {
  const hiddenName = pickRandomCharacterName(excludeNames, gameCharacterNames);
  const work = gameCharacterWork[hiddenName];
  const { clues } = await generateCharacterClues(hiddenName, work);
  return { hiddenName, clues };
}
