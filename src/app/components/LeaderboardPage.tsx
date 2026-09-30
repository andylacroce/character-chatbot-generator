"use client";

/**
 * Public top-ten scores for both guessing games, as tabs on one page. "Guess Who" is the
 * first/default-active tab everywhere both games are listed together (a standing product
 * rule, GAME_LIST's order), "Guess Who's Next" second.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GAME_LIST, GAMES, LEADERBOARD_COPY, type GameId } from "character-chatbot-shared";
import { hasNavigatedWithinSession } from "../../utils/clientNavigationState";
import AppHeader from "./AppHeader";
import BackHomeLink from "./BackHomeLink";
import LeaderboardTable from "./LeaderboardTable";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/Leaderboard.module.css";

/** Lists public entries without revealing the names or scores of players who did not opt in. */
export default function LeaderboardPage() {
  const router = useRouter();
  const { menuItems, modals } = useAccountMenu();
  const [activeId, setActiveId] = useState<GameId>(GAME_LIST[0].id);
  const active = GAMES[activeId];

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
          {GAME_LIST.map((game) => (
            <button
              key={game.id}
              type="button"
              role="tab"
              aria-selected={activeId === game.id}
              className={activeId === game.id ? styles.tabActive : styles.tab}
              onClick={() => setActiveId(game.id)}
              data-testid={`leaderboard-tab-${game.slug}`}
            >
              {game.title}
            </button>
          ))}
        </div>
        <LeaderboardTable key={active.id} game={active} />
        <Link href={`/${active.slug}`} className={styles.playLink}>
          {active.copy.ctaLabel}
        </Link>
      </main>
    </div>
  );
}
