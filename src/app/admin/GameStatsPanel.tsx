import React, { useState } from "react";
import GameActivityChart from "../components/admin/GameActivityChart";
import styles from "../components/styles/AdminStats.module.css";
import { AdminStats, describeWindow, formatPct } from "./adminStatsTypes";

type GameMode = "guessWho" | "guessWhoNext";

const MODES: { id: GameMode; label: string; hint: string }[] = [
  {
    id: "guessWho",
    label: "Guess Who",
    hint: "The player chats with a mystery character that drops clues about itself, and guesses who it is.",
  },
  {
    id: "guessWhoNext",
    label: "Guess Who's Next",
    hint: "The player chats with a named character who steers toward a different, hidden figure. A correct guess starts the next round.",
  },
];

/** The guessing-game tab of the admin stats view: one set of figures per game mode. */
export function GameStatsPanel({ stats }: { stats: AdminStats }) {
  const [activeMode, setActiveMode] = useState<GameMode>("guessWho");
  const game = stats[activeMode];
  const mode = MODES.find((m) => m.id === activeMode)!;

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
            Guessing games
          </h2>
          <p className={styles.sectionHint}>
            {mode.hint} Figures cover {describeWindow(stats.timeWindow)}, guests and signed-in
            players combined. A second wrong guess ends a run.
          </p>
        </div>
        <div className={styles.gameModeTabs} role="group" aria-label="Game">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={activeMode === m.id}
              className={`${styles.gameModeTab} ${activeMode === m.id ? styles.gameModeTabActive : ""}`}
              onClick={() => setActiveMode(m.id)}
            >
              {m.label} · {stats[m.id].starts} runs
            </button>
          ))}
        </div>
      </div>

      <div className={styles.statGrid}>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Runs started</p>
          <p className={styles.statValue}>{game.starts}</p>
          <p className={styles.statSub}>
            {game.startedToday} today · {game.startedLast7Days} in the last 7 days
          </p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Guess accuracy</p>
          <p className={styles.statValue}>{formatPct(game.guessAccuracyPct)}</p>
          <p className={styles.statSub}>
            {game.correctGuesses} correct · {game.wrongGuesses} wrong
          </p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Exchanges to solve</p>
          <p className={styles.statValue}>{game.avgTurnsToSolve ?? "n/a"}</p>
          <p className={styles.statSub}>Average exchanges before a correct guess</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Average final streak</p>
          <p className={styles.statValue}>{game.avgFinalStreak ?? "—"}</p>
          <p className={styles.statSub}>Correct guesses per finished run</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Best streak</p>
          <p className={styles.statValue}>{game.bestStreak}</p>
          <p className={styles.statSub}>Longest run in this window</p>
        </div>
      </div>
      <div className={styles.mainGrid}>
        <div className={`${styles.section} ${styles.chartSection}`}>
          <h3 className={styles.sectionTitle}>Game activity</h3>
          <GameActivityChart data={game.daily} endDay={stats.timeWindow.to} />
        </div>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>How runs end</h3>
          <dl className={styles.gameFacts}>
            <div>
              <dt>Started by guests</dt>
              <dd>
                {game.guestStarts} ({formatPct(game.guestPct)})
              </dd>
            </div>
            {activeMode === "guessWhoNext" && (
              <div>
                <dt>Correct guesses followed by another round</dt>
                <dd>
                  {game.continuedRounds} ({formatPct(game.continuationPct)})
                </dd>
              </div>
            )}
            <div>
              <dt>Ended by a second wrong guess</dt>
              <dd>{game.endedByWrongGuess}</dd>
            </div>
            <div>
              <dt>Ended by giving up</dt>
              <dd>{game.endedByGiveUp}</dd>
            </div>
          </dl>
          <h4 className={styles.gameSubheading}>Final streaks (finished runs)</h4>
          <div className={styles.gameStreakGrid}>
            <span>
              0 wins <strong>{game.finalStreaks.zero}</strong>
            </span>
            <span>
              1 win <strong>{game.finalStreaks.one}</strong>
            </span>
            <span>
              2–4 wins <strong>{game.finalStreaks.twoToFour}</strong>
            </span>
            <span>
              5+ wins <strong>{game.finalStreaks.fiveOrMore}</strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
