/**
 * Pure character-name picker shared by /api/random-character and the guessing game's
 * round selection. Each caller owns its own exclusion list — the route's own
 * repeat-avoidance tracker and the game's per-streak `usedNames` list are different
 * concerns and must not share state.
 */

import characterNames from "../data/characterNames";

/**
 * Picks a random name from the curated public-domain character list, avoiding any name
 * in `excludeNames` (case-insensitive) when possible. Falls back to the full list once
 * every name has been excluded, so this never fails to return a name.
 */
export function pickRandomCharacterName(excludeNames: string[] = []): string {
  const excludeSet = new Set(excludeNames.map((name) => name.toLowerCase()));
  const available = characterNames.filter((name) => !excludeSet.has(name.toLowerCase()));
  const pool = available.length > 0 ? available : characterNames;
  return pool[Math.floor(Math.random() * pool.length)];
}
