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
import {
  displayCharacterName,
  fillTemplate,
  GAME_CORRECT_BANNER,
  GAME_GIVE_UP_CONFIRM,
  GAME_SCREEN_COPY,
  GAME_STREAK_LABEL,
  STORAGE_KEYS,
} from "character-chatbot-shared";
import ChatShell from "./ChatShell";
import BackHomeLink from "./BackHomeLink";
import GameInstructionsModal from "./GameInstructionsModal";
import LeaderboardClaim from "./LeaderboardClaim";
import CharacterLoadingOverlay from "./CharacterLoadingOverlay";
import storage from "../../src/utils/storage";
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
    displayedStreak,
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
    continueProgressStages = [],
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
    startProgressStages = [],
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
          <h1 className={styles.startHeadline}>
            {gameOver ? GAME_SCREEN_COPY.gameOverHeadline : GAME_SCREEN_COPY.headline}
          </h1>
          {gameOver && lastEvent?.type === "gameover" ? (
            <p className={styles.startSubhead}>
              {fillTemplate(GAME_SCREEN_COPY.gameOverSubhead, {
                name: displayCharacterName(lastEvent.revealedName),
                streak: lastEvent.finalStreak,
              })}
            </p>
          ) : (
            <p className={styles.startSubhead}>{GAME_SCREEN_COPY.subhead}</p>
          )}
          <button
            type="button"
            className={styles.startButton}
            onClick={startGame}
            disabled={starting}
            data-testid={gameOver ? "game-play-again-button" : "game-start-button"}
          >
            {gameOver ? GAME_SCREEN_COPY.playAgainLabel : GAME_SCREEN_COPY.startLabel}
          </button>
          <CharacterLoadingOverlay
            show={starting}
            title={GAME_SCREEN_COPY.startingLabel}
            message={startProgressMessage}
            stages={startProgressStages}
            testId="game-start-progress"
          />
          {gameOver && (
            <>
              <LeaderboardClaim />
              <button
                type="button"
                className={styles.leaderboardButton}
                onClick={() => router.push("/leaderboard")}
              >
                <FaTrophy aria-hidden="true" />
                {GAME_SCREEN_COPY.leaderboardLabel}
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
        <h2 className={styles.modalTitle}>{GAME_GIVE_UP_CONFIRM.title}</h2>
        <p className={styles.modalText}>{GAME_GIVE_UP_CONFIRM.body}</p>
        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancelButton} onClick={handleGiveUpCancel}>
            {GAME_GIVE_UP_CONFIRM.cancelLabel}
          </button>
          <button type="button" className={styles.modalConfirmButton} onClick={handleGiveUpConfirm}>
            {GAME_GIVE_UP_CONFIRM.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  // "Best" only appears once the player actually has a personal best on record — a
  // guest with no scored run yet shows just the plain streak badge. `displayedStreak`
  // already reflects a just-won streak while the Continue banner is up, so the header
  // never disagrees with the banner in front of it.
  const belowName = (
    <div className={styles.streakBadge} data-testid="game-streak-badge">
      {GAME_STREAK_LABEL}: {displayedStreak}
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
            {fillTemplate(GAME_CORRECT_BANNER, {
              revealedName: displayCharacterName(lastEvent.revealedName),
              streak: lastEvent.streak,
            })}
          </span>
          <button
            type="button"
            className={styles.correctGuessContinueButton}
            onClick={continueRound}
            data-testid="game-continue-button"
          >
            {GAME_SCREEN_COPY.continueLabel}
          </button>
        </div>
      )}
      {/* The next character isn't generated until "Continue" is clicked (see
          useGameController.ts's continueRound), so this reuses the exact same lightbox
          the start screen uses above — same underlying generation pipeline, same UX,
          rather than a silent/generic loading state. */}
      <CharacterLoadingOverlay
        show={continuing}
        title={GAME_SCREEN_COPY.continuingLabel}
        message={continueProgressMessage}
        stages={continueProgressStages}
        testId="game-continue-progress"
      />
      {lastEvent?.type === "wrong" && (
        <div className={styles.eventBanner} data-testid="game-event-wrong">
          {GAME_SCREEN_COPY.wrongBanner}
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
