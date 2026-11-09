import React from "react";
import GameActivityChart from "../components/admin/GameActivityChart";
import styles from "../components/styles/AdminStats.module.css";
import { AdminStats, formatPct } from "./adminStatsTypes";

/** The guessing-game tab of the admin stats view. */
export function GameStatsPanel({ stats }: { stats: AdminStats }) {
  return (
    <section
      id="game-stats-panel"
      className={styles.dashboardSection}
      role="tabpanel"
      aria-labelledby="game-stats-tab"
    >
      <div className={styles.gameSectionHeading}>
        <div>
          <h2 id="game-stats-title" className={styles.gameTitle}>
            Guessing game
          </h2>
          <p className={styles.sectionHint}>All-time totals across guests and signed-in users</p>
        </div>
      </div>
      <div className={styles.statGrid}>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Runs started</p>
          <p className={styles.statValue}>{stats.game.starts}</p>
          <p className={styles.statSub}>
            {stats.game.startedToday} today · {stats.game.startedLast7Days} last 7 days
          </p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Guess accuracy</p>
          <p className={styles.statValue}>{formatPct(stats.game.guessAccuracyPct)}</p>
          <p className={styles.statSub}>
            {stats.game.correctGuesses} correct · {stats.game.wrongGuesses} wrong
          </p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Average final streak</p>
          <p className={styles.statValue}>{stats.game.avgFinalStreak ?? "—"}</p>
          <p className={styles.statSub}>Across recorded run endings</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Average turns to solve</p>
          <p className={styles.statValue}>{stats.game.avgTurnsToSolve ?? "n/a"}</p>
          <p className={styles.statSub}>Chat turns before a correct guess</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Best streak reached</p>
          <p className={styles.statValue}>{stats.game.bestStreak}</p>
          <p className={styles.statSub}>Correct guesses in one run</p>
        </div>
      </div>
      <div className={styles.mainGrid}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Game activity</h3>
          <GameActivityChart data={stats.game.daily} />
        </div>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>How runs progress</h3>
          <dl className={styles.gameFacts}>
            <div>
              <dt>Guest starts</dt>
              <dd>
                {stats.game.guestStarts} ({formatPct(stats.game.guestPct)})
              </dd>
            </div>
            <div>
              <dt>Rounds continued</dt>
              <dd>
                {stats.game.continuedRounds} ({formatPct(stats.game.continuationPct)} of correct
                guesses)
              </dd>
            </div>
            <div>
              <dt>Ended after two wrong guesses</dt>
              <dd>{stats.game.endedByWrongGuess}</dd>
            </div>
            <div>
              <dt>Gave up</dt>
              <dd>{stats.game.endedByGiveUp}</dd>
            </div>
          </dl>
          <h4 className={styles.gameSubheading}>Final streaks</h4>
          <div className={styles.gameStreakGrid}>
            <span>
              0 wins <strong>{stats.game.finalStreaks.zero}</strong>
            </span>
            <span>
              1 win <strong>{stats.game.finalStreaks.one}</strong>
            </span>
            <span>
              2–4 wins <strong>{stats.game.finalStreaks.twoToFour}</strong>
            </span>
            <span>
              5+ wins <strong>{stats.game.finalStreaks.fiveOrMore}</strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
