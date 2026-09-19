/**
 * Pure character-name picker shared by /api/random-character and the guessing game's
 * round selection. Each caller owns its own exclusion list — the route's own
 * repeat-avoidance tracker and the game's per-streak `usedNames` list are different
 * concerns and must not share state.
 */

import { randomInt } from "crypto";
import characterNames from "../data/characterNames";

/**
 * Picks a random name from `pool` (defaulting to the full curated character list),
 * avoiding any name in `excludeNames` (case-insensitive) when possible. Falls back to
 * the full pool once every name in it has been excluded, so this never fails to return
 * a name. The guessing game passes `gameCharacterNames` (see GitHub issue #878) instead
 * of the default pool, since an obscure name makes a hidden-identity round unwinnable.
 */
export function pickRandomCharacterName(
  excludeNames: string[] = [],
  pool: string[] = characterNames,
): string {
  const excludeSet = new Set(excludeNames.map((name) => name.toLowerCase()));
  const available = pool.filter((name) => !excludeSet.has(name.toLowerCase()));
  const finalPool = available.length > 0 ? available : pool;
  return finalPool[randomInt(finalPool.length)];
}
