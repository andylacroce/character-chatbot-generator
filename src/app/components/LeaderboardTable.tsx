"use client";

/**
 * Presentational rank/name/streak table, extracted out of LeaderboardPage.tsx so both
 * "Guess Who" and "Guess Who's Next"'s leaderboard tabs render identical markup instead
 * of two copy-pasted `<table>` blocks. Owns its own data loading via `useLeaderboard`
 * (given the two games' distinct `fetchEntries` functions) so each tab remounts with a
 * fresh load when switched to (see LeaderboardPage.tsx's `key`-per-tab).
 */

import { LEADERBOARD_COPY, useLeaderboard, type LeaderboardEntry } from "character-chatbot-shared";
import LeaderboardClaim from "./LeaderboardClaim";
import styles from "./styles/Leaderboard.module.css";

interface LeaderboardTableProps {
  fetchEntries: () => Promise<LeaderboardEntry[]>;
  settingsUrl: string;
}

/** One game's public top-ten table plus its own top-ten name-claim form. */
export default function LeaderboardTable({ fetchEntries, settingsUrl }: LeaderboardTableProps) {
  const { entries, loading, error, reload } = useLeaderboard(fetchEntries);

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
      <LeaderboardClaim onChange={reload} settingsUrl={settingsUrl} />
    </>
  );
}
