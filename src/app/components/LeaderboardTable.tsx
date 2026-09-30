"use client";

/**
 * Presentational rank/name/streak table, so both games' leaderboard tabs render identical
 * markup. Owns its own data loading via `useLeaderboard` so each tab remounts with a fresh
 * load when switched to (see LeaderboardPage.tsx's `key`-per-tab).
 */

import {
  gameApiUrl,
  LEADERBOARD_COPY,
  useLeaderboard,
  type GameDefinition,
  type LeaderboardEntry,
} from "character-chatbot-shared";
import { authenticatedFetch } from "../../utils/api";
import LeaderboardClaim from "./LeaderboardClaim";
import styles from "./styles/Leaderboard.module.css";

/** Loads a game's public top ten. */
async function fetchEntries(game: GameDefinition): Promise<LeaderboardEntry[]> {
  const res = await authenticatedFetch(gameApiUrl(game, "leaderboard"));
  if (!res.ok) throw new Error("Failed to load leaderboard");
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
}

/** One game's public top-ten table plus its own top-ten name-claim form. */
export default function LeaderboardTable({ game }: { game: GameDefinition }) {
  const { entries, loading, error, reload } = useLeaderboard(() => fetchEntries(game));

  return (
    <>
      {loading ? (
        <p role="status">{LEADERBOARD_COPY.loading}</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : entries.length === 0 ? (
        <p>{LEADERBOARD_COPY.empty}</p>
      ) : (
        <table className={styles.table}>
          <caption>{LEADERBOARD_COPY.tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{LEADERBOARD_COPY.rankLabel}</th>
              <th scope="col">{LEADERBOARD_COPY.playerLabel}</th>
              <th scope="col">{LEADERBOARD_COPY.streakLabel}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.rank}>
                <td>{entry.rank}</td>
                <td>{entry.name}</td>
                <td>{entry.streak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <LeaderboardClaim game={game} onChange={reload} />
    </>
  );
}
