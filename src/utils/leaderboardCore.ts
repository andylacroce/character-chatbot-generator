/**
 * Pure account-rows + guest-rows merge/rank logic shared by every per-game leaderboard
 * (`gameLeaderboard.ts` for "Guess Who's Next", `guessWhoLeaderboard.ts` for "Guess
 * Who") — extracted out of `gameLeaderboard.ts` so a future ranking-rule change applies
 * to both games at once. Each game's own module still does its own DB queries (they hit
 * different Drizzle tables), only the merge/sort/top-ten slice is shared here.
 */

export interface RankedScore {
  id: string;
  streak: number;
  date: Date;
  kind: "user" | "guest";
}

/**
 * Merges an account-scored list and a guest-scored list into one overall top-ten,
 * ranked by streak (desc), then earliest achieved (asc), then id (for a stable,
 * deterministic tie-break). Both input lists are assumed already capped to their own
 * top ten by the caller's query, so this never has to rank more than twenty rows.
 */
export function mergeAndRankLeaderboard(
  accountRows: Array<{ id: string; streak: number; date: Date }>,
  guestRows: Array<{ id: string; streak: number; date: Date }>,
): RankedScore[] {
  return [
    ...accountRows.map((score) => ({ ...score, kind: "user" as const })),
    ...guestRows.map((score) => ({ ...score, kind: "guest" as const })),
  ]
    .sort(
      (a, b) =>
        b.streak - a.streak ||
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 10);
}
