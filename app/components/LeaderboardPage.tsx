"use client";

/** Public top-ten guessing-game scores and the signed-in player's claim form. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "../../src/utils/api";
import { hasNavigatedWithinSession } from "../../src/utils/clientNavigationState";
import AppHeader from "./AppHeader";
import BackHomeLink from "./BackHomeLink";
import LeaderboardClaim from "./LeaderboardClaim";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/Leaderboard.module.css";

interface Entry {
  rank: number;
  name: string;
  streak: number;
}

/** Lists public entries without revealing the names or scores of players who did not opt in. */
export default function LeaderboardPage() {
  const router = useRouter();
  const { menuItems, modals } = useAccountMenu();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/game/leaderboard");
      if (!res.ok) throw new Error("Failed to load leaderboard");
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setError("");
    } catch {
      setError("Could not load the leaderboard. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The async request updates state only when its response arrives.
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  return (
    <div className={styles.page}>
      <AppHeader
        menuItems={menuItems}
        left={
          <BackHomeLink
            label="Back"
            icon="back"
            onClick={(event) => {
              event.preventDefault();
              if (hasNavigatedWithinSession()) router.back();
              else router.push("/");
            }}
          />
        }
      />
      {modals}
      <main className={styles.main}>
        <h1>Guessing Game Leaderboard</h1>
        {loading ? (
          <p role="status">Loading scores…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : entries.length === 0 ? (
          <p>No players have shared a top 10 score yet.</p>
        ) : (
          <table className={styles.table}>
            <caption>Public top 10 scores</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Streak</th>
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
        <LeaderboardClaim onChange={load} />
        <Link href="/game" className={styles.playLink}>
          Play Guessing Game
        </Link>
      </main>
    </div>
  );
}
