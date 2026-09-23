"use client";

/** Public top-ten guessing-game scores and the signed-in player's claim form. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEADERBOARD_COPY, useLeaderboard, type LeaderboardEntry } from "character-chatbot-shared";
import { authenticatedFetch } from "../../src/utils/api";
import { hasNavigatedWithinSession } from "../../src/utils/clientNavigationState";
import AppHeader from "./AppHeader";
import BackHomeLink from "./BackHomeLink";
import LeaderboardClaim from "./LeaderboardClaim";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/Leaderboard.module.css";

/** Loads the public top ten (list state lives in the shared useLeaderboard hook). */
async function fetchEntries(): Promise<LeaderboardEntry[]> {
  const res = await authenticatedFetch("/api/game/leaderboard");
  if (!res.ok) throw new Error("Failed to load leaderboard");
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
}

/** Lists public entries without revealing the names or scores of players who did not opt in. */
export default function LeaderboardPage() {
  const router = useRouter();
  const { menuItems, modals } = useAccountMenu();
  const { entries, loading, error, reload } = useLeaderboard(fetchEntries);

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
        <h1>{LEADERBOARD_COPY.title}</h1>
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
        <LeaderboardClaim onChange={reload} />
        <Link href="/game" className={styles.playLink}>
          {LEADERBOARD_COPY.playLabel}
        </Link>
      </main>
    </div>
  );
}
