"use client";

/**
 * "Guess Who" (the clue-reveal game)'s main screen: a "start" hero before a run
 * begins, then a clue card + dedicated guess input (no chat, unlike "Guess Who's
 * Next" — see CLAUDE.md's "Second game mode" plan for why this game gets its own
 * simpler screen rather than reusing ChatShell). A wrong guess reveals the next clue;
 * running out of clues, or Give Up, reveals the hidden character with its avatar.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { FaFlag, FaHome, FaQuestionCircle, FaTrophy } from "react-icons/fa";
import {
  displayCharacterName,
  fillTemplate,
  GUESS_WHO_CORRECT_BANNER,
  GUESS_WHO_GIVE_UP_CONFIRM,
  GUESS_WHO_INSTRUCTIONS,
  GUESS_WHO_SCREEN_COPY,
  GUESS_WHO_STREAK_LABEL,
  STORAGE_KEYS,
} from "character-chatbot-shared";
import AppHeader from "./AppHeader";
import BackHomeLink from "./BackHomeLink";
import GameInstructionsModal from "./GameInstructionsModal";
import LeaderboardClaim from "./LeaderboardClaim";
import storage from "../../utils/storage";
import { useGuessWhoController } from "./useGuessWhoController";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/GuessWhoPage.module.css";

/** "Guess Who"'s main screen — see module doc above. */
function GuessWhoPage() {
  const router = useRouter();
  const {
    started,
    starting,
    clue,
    clueNumber,
    totalClues,
    displayedStreak,
    highScore,
    guess,
    setGuess,
    loading,
    error,
    lastEvent,
    continueRound,
    continuing,
    startGame,
    quitGame,
    giveUp,
    submitGuess,
    handleKeyDown,
  } = useGuessWhoController();

  const { menuItems: accountMenuItems, modals: accountModals } = useAccountMenu();

  const [showInstructions, setShowInstructions] = React.useState(false);
  const [showGiveUpConfirmation, setShowGiveUpConfirmation] = React.useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (!storage.getItem(STORAGE_KEYS.guessWhoInstructionsSeen)) {
      setShowInstructions(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const closeInstructions = React.useCallback(() => {
    setShowInstructions(false);
    storage.setItem(STORAGE_KEYS.guessWhoInstructionsSeen, "true");
  }, []);

  const handleBackToHome = React.useCallback(() => {
    quitGame();
  }, [quitGame]);

  const handleGiveUpClick = React.useCallback(() => setShowGiveUpConfirmation(true), []);
  const handleGiveUpConfirm = React.useCallback(() => {
    setShowGiveUpConfirmation(false);
    giveUp(true);
  }, [giveUp]);
  const handleGiveUpCancel = React.useCallback(() => setShowGiveUpConfirmation(false), []);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submitGuess();
    },
    [submitGuess],
  );

  const gameOver = lastEvent?.type === "gameover";
  const correct = lastEvent?.type === "correct";
  const showReveal = correct || gameOver;

  const menuItems = (
    <>
      {started && (
        <>
          <button className={styles.menuItemLink} type="button" onClick={handleBackToHome}>
            <FaHome size={18} className="menuIcon" />
            <span>Back to Home</span>
          </button>
          {!showReveal && (
            <button className={styles.menuItemLink} type="button" onClick={handleGiveUpClick}>
              <FaFlag size={18} className="menuIcon" />
              <span>{GUESS_WHO_SCREEN_COPY.giveUpLabel}</span>
            </button>
          )}
        </>
      )}
      <button
        className={styles.menuItemLink}
        type="button"
        onClick={() => setShowInstructions(true)}
      >
        <FaQuestionCircle size={18} className="menuIcon" />
        <span>How to Play</span>
      </button>
      <div className="menuDivider" role="separator" />
      {accountMenuItems}
    </>
  );

  const giveUpConfirmation = (
    <div className={styles.modalBackdrop} onClick={handleGiveUpCancel}>
      <div className={styles.modalBox} onClick={(event) => event.stopPropagation()}>
        <h2 className={styles.modalTitle}>{GUESS_WHO_GIVE_UP_CONFIRM.title}</h2>
        <p className={styles.modalText}>{GUESS_WHO_GIVE_UP_CONFIRM.body}</p>
        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancelButton} onClick={handleGiveUpCancel}>
            {GUESS_WHO_GIVE_UP_CONFIRM.cancelLabel}
          </button>
          <button type="button" className={styles.modalConfirmButton} onClick={handleGiveUpConfirm}>
            {GUESS_WHO_GIVE_UP_CONFIRM.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  const modals = (
    <>
      {accountModals}
      <GameInstructionsModal
        show={showInstructions}
        onClose={closeInstructions}
        copy={GUESS_WHO_INSTRUCTIONS}
      />
      {showGiveUpConfirmation && giveUpConfirmation}
    </>
  );

  if (!started) {
    return (
      <div className={styles.page} data-testid="guess-who-layout">
        <AppHeader menuItems={menuItems} left={<BackHomeLink />} />
        {modals}
        <div className={styles.standaloneScreen}>
          <div className={styles.startScreen}>
            <h1 className={styles.startHeadline}>
              {gameOver ? GUESS_WHO_SCREEN_COPY.gameOverHeadline : GUESS_WHO_SCREEN_COPY.headline}
            </h1>
            {gameOver && lastEvent?.type === "gameover" ? (
              <p className={styles.startSubhead}>
                {fillTemplate(GUESS_WHO_SCREEN_COPY.gameOverSubhead, {
                  name: displayCharacterName(lastEvent.revealedName),
                  streak: lastEvent.finalStreak,
                })}
              </p>
            ) : (
              <p className={styles.startSubhead}>{GUESS_WHO_SCREEN_COPY.subhead}</p>
            )}
            <button
              type="button"
              className={styles.startButton}
              onClick={startGame}
              disabled={starting}
              data-testid={gameOver ? "guess-who-play-again-button" : "guess-who-start-button"}
            >
              {starting
                ? GUESS_WHO_SCREEN_COPY.startingLabel
                : gameOver
                  ? GUESS_WHO_SCREEN_COPY.playAgainLabel
                  : GUESS_WHO_SCREEN_COPY.startLabel}
            </button>
            {gameOver && (
              <>
                <LeaderboardClaim settingsUrl="/api/guess-who/leaderboard-settings" />
                <button
                  type="button"
                  className={styles.leaderboardButton}
                  onClick={() => router.push("/leaderboard")}
                >
                  <FaTrophy aria-hidden="true" />
                  {GUESS_WHO_SCREEN_COPY.leaderboardLabel}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="guess-who-layout">
      <AppHeader menuItems={menuItems} left={<BackHomeLink />} />
      {modals}
      <div className={styles.roundScreen}>
        <div className={styles.streakBadge} data-testid="guess-who-streak-badge">
          {GUESS_WHO_STREAK_LABEL}: {displayedStreak}
          {typeof highScore === "number" && highScore > 0 && (
            <span className={styles.highScoreBadge} data-testid="guess-who-high-score-badge">
              {" "}
              · Best: {highScore}
            </span>
          )}
        </div>

        {showReveal ? (
          <div className={styles.revealBanner} data-testid="guess-who-reveal-banner">
            {lastEvent && "avatarUrl" in lastEvent && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={lastEvent.avatarUrl}
                alt={displayCharacterName(lastEvent.revealedName)}
                className={styles.revealAvatar}
              />
            )}
            <span className={styles.revealText}>
              {correct && lastEvent?.type === "correct"
                ? fillTemplate(GUESS_WHO_CORRECT_BANNER, {
                    revealedName: displayCharacterName(lastEvent.revealedName),
                    streak: lastEvent.streak,
                  })
                : lastEvent?.type === "gameover"
                  ? fillTemplate(GUESS_WHO_SCREEN_COPY.gameOverSubhead, {
                      name: displayCharacterName(lastEvent.revealedName),
                      streak: lastEvent.finalStreak,
                    })
                  : ""}
            </span>
            {correct ? (
              <button
                type="button"
                className={styles.revealContinueButton}
                onClick={continueRound}
                disabled={continuing}
                data-testid="guess-who-continue-button"
              >
                {continuing
                  ? GUESS_WHO_SCREEN_COPY.continuingLabel
                  : GUESS_WHO_SCREEN_COPY.continueLabel}
              </button>
            ) : (
              <button
                type="button"
                className={styles.revealContinueButton}
                onClick={handleBackToHome}
                data-testid="guess-who-back-home-button"
              >
                {GUESS_WHO_SCREEN_COPY.playAgainLabel}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={styles.clueCard} data-testid="guess-who-clue-card">
              <span className={styles.clueLabel}>
                {GUESS_WHO_SCREEN_COPY.clueLabel} {clueNumber} / {totalClues || 5}
              </span>
              <p className={styles.clueText}>{clue}</p>
              <div className={styles.clueDots} aria-hidden="true">
                {Array.from({ length: totalClues || 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.clueDot} ${i < clueNumber ? styles.clueDotFilled : ""}`}
                  />
                ))}
              </div>
            </div>

            {lastEvent?.type === "wrong" && (
              <div className={styles.wrongBanner} data-testid="guess-who-event-wrong">
                Not quite — here&apos;s another clue.
              </div>
            )}

            <form className={styles.guessForm} onSubmit={handleSubmit}>
              <input
                type="text"
                className={styles.guessInput}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={GUESS_WHO_SCREEN_COPY.guessPlaceholder}
                disabled={loading}
                data-testid="guess-who-input"
                aria-label="Your guess"
              />
              <button
                type="submit"
                className={styles.guessButton}
                disabled={loading || !guess.trim()}
                data-testid="guess-who-submit-button"
              >
                {GUESS_WHO_SCREEN_COPY.guessButtonLabel}
              </button>
            </form>

            <button
              type="button"
              className={styles.giveUpButton}
              onClick={handleGiveUpClick}
              data-testid="guess-who-give-up-link"
            >
              {GUESS_WHO_SCREEN_COPY.giveUpLabel}
            </button>
          </>
        )}

        {error && (
          <div className={styles.errorBanner} data-testid="guess-who-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default GuessWhoPage;
