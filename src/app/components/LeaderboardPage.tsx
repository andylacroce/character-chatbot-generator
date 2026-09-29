"use client";

/**
 * Public top-ten scores for both guessing games, as tabs on one page — "Guess Who" is
 * the first/default-active tab everywhere both games are listed together (a standing
 * product rule, see CLAUDE.md's "Second game mode" plan), "Guess Who's Next" second.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEADERBOARD_COPY, type LeaderboardEntry } from "character-chatbot-shared";
import { authenticatedFetch } from "../../utils/api";
import { hasNavigatedWithinSession } from "../../utils/clientNavigationState";
import AppHeader from "./AppHeader";
import BackHomeLink from "./BackHomeLink";
import LeaderboardTable from "./LeaderboardTable";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/Leaderboard.module.css";

type LeaderboardTab = "guess-who" | "guess-who-next";

const TABS: { id: LeaderboardTab; label: string }[] = [
  { id: "guess-who", label: "Guess Who" },
  { id: "guess-who-next", label: "Guess Who's Next" },
];

/** Loads the "Guess Who" public top ten. */
async function fetchGuessWhoEntries(): Promise<LeaderboardEntry[]> {
  const res = await authenticatedFetch("/api/guess-who/leaderboard");
  if (!res.ok) throw new Error("Failed to load leaderboard");
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
}

/** Loads the "Guess Who's Next" public top ten. */
async function fetchGuessWhoNextEntries(): Promise<LeaderboardEntry[]> {
  const res = await authenticatedFetch("/api/guess-who-next/leaderboard");
  if (!res.ok) throw new Error("Failed to load leaderboard");
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
}

/** Lists public entries without revealing the names or scores of players who did not opt in. */
export default function LeaderboardPage() {
  const router = useRouter();
  const { menuItems, modals } = useAccountMenu();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("guess-who");

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
        <div className={styles.tabs} role="tablist" aria-label="Leaderboard game">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`leaderboard-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "guess-who" ? (
          <LeaderboardTable
            key="guess-who"
            fetchEntries={fetchGuessWhoEntries}
            settingsUrl="/api/guess-who/leaderboard-settings"
          />
        ) : (
          <LeaderboardTable
            key="guess-who-next"
            fetchEntries={fetchGuessWhoNextEntries}
            settingsUrl="/api/guess-who-next/leaderboard-settings"
          />
        )}
        <Link
          href={activeTab === "guess-who" ? "/guess-who" : "/guess-who-next"}
          className={styles.playLink}
        >
          {activeTab === "guess-who" ? "Play Guess Who" : LEADERBOARD_COPY.playLabel}
        </Link>
      </main>
    </div>
  );
}
