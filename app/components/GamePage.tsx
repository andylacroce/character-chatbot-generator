"use client";

/**
 * The guessing game's main screen: a "start" hero before a run begins, then the exact
 * same chat UI ChatPage.tsx uses (via the shared ChatShell component) for a normal-
 * looking conversation with the player's current (named, revealed) partner, with a
 * streak badge and round-result banners layered on through ChatShell's slots. The
 * player types both ordinary questions AND guesses into the same box, the server itself
 * classifies which is which (see pages/api/game/message.ts) and, when it's unclear, the
 * character asks the player to confirm in character rather than a separate guess
 * control existing in the UI. Drives its own useGameController hook instead of
 * useChatController, since the game has no bots/messages persistence in this phase, see
 * CLAUDE.md's "Guessing game" section.
 */

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaFlag, FaHome, FaQuestionCircle, FaTrophy } from "react-icons/fa";
import ChatShell from "./ChatShell";
import BackHomeLink from "./BackHomeLink";
import GameInstructionsModal from "./GameInstructionsModal";
import LeaderboardClaim from "./LeaderboardClaim";
import storage from "../../src/utils/storage";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";
import { useGameController } from "./useGameController";
import { useAccountMenu } from "./useAccountMenu";
import type { Bot } from "./BotCreator";
import styles from "./styles/GamePage.module.css";

/** The guessing game's main screen — see module doc above. */
function GamePage() {
  const router = useRouter();
  const {
    started,
    starting,
    currentCharacterName,
    avatarUrl,
    gender,
    streak,
    highScore,
    messages,
    input,
    setInput,
    loading,
    error,
    lastEvent,
    awaitingContinue,
    continueRound,
    continuing,
    continueProgressMessage,
    giveUpRequested,
    clearGiveUpRequest,
    chatBoxRef,
    inputRef,
    audioEnabled,
    handleAudioToggle,
    replayMessageAudio,
    stopAudio,
    isAudioPlaying,
    startGame,
    quitGame,
    giveUp,
    startProgressMessage,
    sendMessage,
    handleKeyDown,
  } = useGameController();

  // Shared with BotCreator.tsx/CharsGallery.tsx/ChatPage.tsx — identity label, change-name
  // and sign-in/out/admin items, folded into this page's own menu below.
  const { userNameCtx, menuItems: accountMenuItems, modals: accountModals } = useAccountMenu();

  const [showInstructions, setShowInstructions] = React.useState(false);
  const [showGiveUpConfirmation, setShowGiveUpConfirmation] = React.useState(false);

  // This page is SSR'd and localStorage is browser-only, so the one-time instructions
  // gate has to be checked post-mount rather than during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (!storage.getItem(STORAGE_KEYS.gameInstructionsSeen)) {
      setShowInstructions(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const closeInstructions = React.useCallback(() => {
    setShowInstructions(false);
    storage.setItem(STORAGE_KEYS.gameInstructionsSeen, "true");
  }, []);

  // The server also detects a give-up intent typed directly into the chat (e.g. "I give
  // up"), not just the menu's Give Up button — either path opens this same confirmation
  // dialog rather than ending the run unconfirmed.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (giveUpRequested) {
      setShowGiveUpConfirmation(true);
      clearGiveUpRequest();
    }
  }, [giveUpRequested, clearGiveUpRequest]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // "Back to Home" ends the run rather than leaving a stale in-progress token behind —
  // there's no separate "Quit" control elsewhere on this page.
  const handleBackToHome = React.useCallback(() => {
    quitGame();
  }, [quitGame]);

  // Gives up with confirmation to avoid accidental abandonment.
  const handleGiveUpClick = React.useCallback(() => {
    setShowGiveUpConfirmation(true);
  }, []);
  const handleGiveUpConfirm = React.useCallback(() => {
    setShowGiveUpConfirmation(false);
    giveUp(true);
  }, [giveUp]);
  const handleGiveUpCancel = React.useCallback(() => {
    setShowGiveUpConfirmation(false);
  }, []);

  const gameOver = lastEvent?.type === "gameover";

  if (!started) {
    return (
      <div className={styles.standaloneScreen} data-testid="game-layout">
        <GameInstructionsModal show={showInstructions} onClose={closeInstructions} />
        <div className={styles.startScreen}>
          <h1 className={styles.startHeadline}>{gameOver ? "Game Over" : "Guess Who's Next?"}</h1>
          {gameOver && lastEvent?.type === "gameover" ? (
            <p className={styles.startSubhead}>
              They were describing <strong>{lastEvent.revealedName}</strong>. Final streak:{" "}
              <strong>{lastEvent.finalStreak}</strong>.
            </p>
          ) : (
            <p className={styles.startSubhead}>
              You&apos;ll start out chatting with a named character, no mystery there. As you talk,
              they&apos;ll start steering the conversation toward someone else entirely, and your
              job is to figure out who. Type your guess right in the chat. Guess right and that
              person joins the chat next, continuing the chain. One wrong guess is forgiven per
              person, but a second ends the run.
            </p>
          )}
          <button
            type="button"
            className={styles.startButton}
            onClick={startGame}
            disabled={starting}
            data-testid={gameOver ? "game-play-again-button" : "game-start-button"}
          >
            {gameOver ? "Play Again" : "Start Game"}
          </button>
          {starting && (
            <div className={styles.startProgressContainer} data-testid="game-start-progress">
              <span className={styles.startSpinner} aria-label="Loading" />
              <div className={styles.startProgressText}>{startProgressMessage}</div>
            </div>
          )}
          {gameOver && (
            <>
              <LeaderboardClaim />
              <button
                type="button"
                className={styles.leaderboardButton}
                onClick={() => router.push("/leaderboard")}
              >
                <FaTrophy aria-hidden="true" />
                View leaderboard
              </button>
            </>
          )}
          <BackHomeLink className={styles.startBackHome} />
        </div>
      </div>
    );
  }

  const gameBot: Bot = {
    name: currentCharacterName,
    personality: "",
    avatarUrl,
    voiceConfig: null,
    gender,
  };

  const menuItems = (
    <>
      <Link href="/" className={styles.menuItemLink} onClick={handleBackToHome}>
        <FaHome size={18} className="menuIcon" />
        <span>Back to Home</span>
      </Link>
      <button className={styles.menuItemLink} type="button" onClick={handleGiveUpClick}>
        <FaFlag size={18} className="menuIcon" />
        <span>Give Up</span>
      </button>
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
        <h2 className={styles.modalTitle}>Give up this run?</h2>
        <p className={styles.modalText}>
          The hidden character will be revealed and the run will end. Your streak will stay as it
          is.
        </p>
        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancelButton} onClick={handleGiveUpCancel}>
            Cancel
          </button>
          <button type="button" className={styles.modalConfirmButton} onClick={handleGiveUpConfirm}>
            Yes, give up
          </button>
        </div>
      </div>
    </div>
  );

  // "Best" only appears once the player actually has a personal best on record — a
  // guest (never fetched, always null) or a freshly signed-in player with no streak
  // beaten yet both show just the plain streak badge, no empty/zero "Best" clutter.
  //
  // While the correct-guess overlay is up, `streak` state itself is still the pre-round
  // value — it's deliberately held back until Continue (see useGameController.ts's
  // continueRound), same as identity/avatar. But the streak *number* the overlay already
  // displays isn't a spoiler the way the next character's name/avatar would be, so
  // showing it here too avoids the header visibly disagreeing with the overlay open
  // right in front of it (e.g. header "Streak: 0" behind an overlay that already says
  // "Streak: 1").
  const displayedStreak =
    awaitingContinue && lastEvent?.type === "correct" ? lastEvent.streak : streak;
  const belowName = (
    <div className={styles.streakBadge} data-testid="game-streak-badge">
      Streak: {displayedStreak}
      {typeof highScore === "number" && highScore > 0 && (
        <span className={styles.highScoreBadge} data-testid="game-high-score-badge">
          {" "}
          · Best: {highScore}
        </span>
      )}
    </div>
  );

  const bannerContent = (
    <>
      {awaitingContinue && lastEvent?.type === "correct" && (
        <div className={styles.correctGuessBanner} data-testid="game-event-correct">
          <span className={styles.correctGuessText}>
            🎉 Correct! It was {lastEvent.revealedName}! Streak: {lastEvent.streak}.
          </span>
          <button
            type="button"
            className={styles.correctGuessContinueButton}
            onClick={continueRound}
            data-testid="game-continue-button"
          >
            Continue
          </button>
        </div>
      )}
      {continuing && (
        // The next character isn't generated until "Continue" is clicked (see
        // useGameController.ts's continueRound), so this reuses the exact same staged,
        // real-progress spinner the start screen uses below — same underlying
        // generation pipeline, same UX, rather than a silent/generic loading state.
        <div className={styles.startProgressContainer} data-testid="game-continue-progress">
          <span className={styles.startSpinner} aria-label="Loading" />
          <div className={styles.startProgressText}>{continueProgressMessage}</div>
        </div>
      )}
      {lastEvent?.type === "wrong" && (
        <div className={styles.eventBanner} data-testid="game-event-wrong">
          Not quite. You have one more guess before this run ends.
        </div>
      )}
    </>
  );

  return (
    <ChatShell
      bot={gameBot}
      messages={messages}
      userName={userNameCtx.name}
      menuItems={menuItems}
      belowName={belowName}
      modals={
        <>
          {accountModals}
          <GameInstructionsModal show={showInstructions} onClose={closeInstructions} />
          {showGiveUpConfirmation && giveUpConfirmation}
        </>
      }
      bannerContent={bannerContent}
      input={input}
      setInput={setInput}
      onSend={sendMessage}
      onKeyDown={handleKeyDown}
      loading={loading}
      apiAvailable={!awaitingContinue && !continuing}
      chatBoxRef={chatBoxRef}
      inputRef={inputRef}
      audioEnabled={audioEnabled}
      onAudioToggle={handleAudioToggle}
      onReplayAudio={replayMessageAudio}
      onStopAudio={stopAudio}
      isAudioPlaying={isAudioPlaying}
      error={error}
      retrying={false}
    />
  );
}

export default GamePage;
