"use client";

/**
 * "Guess Who" (the self-describing chat game)'s main screen: a "start" hero before a run
 * begins, then the exact same chat UI ChatPage.tsx/GuessWhoNextPage.tsx use (via the
 * shared ChatShell component). The player chats with a mystery character who never
 * reveals its own name — the header shows a silhouette placeholder and "???" until a
 * correct guess or give-up reveals the real name and avatar. The player types both
 * ordinary questions AND guesses into the same box; the server classifies which is which
 * (see pages/api/guess-who/message.ts). Drives its own useGuessWhoController hook, see
 * CLAUDE.md's "Guess Who" section.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { FaFlag, FaHome, FaQuestionCircle, FaTrophy } from "react-icons/fa";
import {
  displayCharacterName,
  fillTemplate,
  GUESS_WHO_CORRECT_BANNER,
  GUESS_WHO_FALLBACK_AVATAR,
  GUESS_WHO_GIVE_UP_CONFIRM,
  GUESS_WHO_INSTRUCTIONS,
  GUESS_WHO_MYSTERY_NAME,
  GUESS_WHO_SCREEN_COPY,
  GUESS_WHO_STREAK_LABEL,
  STORAGE_KEYS,
} from "character-chatbot-shared";
import ChatShell from "./ChatShell";
import BackHomeLink from "./BackHomeLink";
import GameInstructionsModal from "./GameInstructionsModal";
import LeaderboardClaim from "./LeaderboardClaim";
import CharacterLoadingOverlay from "./CharacterLoadingOverlay";
import storage from "../../utils/storage";
import { useGuessWhoController } from "./useGuessWhoController";
import { useAccountMenu } from "./useAccountMenu";
import type { Bot } from "./BotCreator";
import styles from "./styles/GuessWhoPage.module.css";

/** "Guess Who"'s main screen — see module doc above. */
function GuessWhoPage() {
  const router = useRouter();
  const {
    started,
    starting,
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
    isSpeechSupported,
    isRecording,
    handleMicToggle,
  } = useGuessWhoController();

  const { userNameCtx, menuItems: accountMenuItems, modals: accountModals } = useAccountMenu();

  const [showInstructions, setShowInstructions] = React.useState(false);
  const [showGiveUpConfirmation, setShowGiveUpConfirmation] = React.useState(false);

  // This page is SSR'd and localStorage is browser-only, so the one-time instructions
  // gate has to be checked post-mount rather than during render.
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

  // The server also detects a give-up intent typed directly into the chat, not just the
  // menu's Give Up button — either path opens this same confirmation dialog.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (giveUpRequested) {
      setShowGiveUpConfirmation(true);
      clearGiveUpRequest();
    }
  }, [giveUpRequested, clearGiveUpRequest]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // "Back to Home" ends the run rather than leaving a stale in-progress token behind.
  const handleBackToHome = React.useCallback(() => {
    quitGame();
  }, [quitGame]);

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
      <div className={styles.standaloneScreen} data-testid="guess-who-layout">
        <GameInstructionsModal
          show={showInstructions}
          onClose={closeInstructions}
          copy={GUESS_WHO_INSTRUCTIONS}
        />
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
            {gameOver ? GUESS_WHO_SCREEN_COPY.playAgainLabel : GUESS_WHO_SCREEN_COPY.startLabel}
          </button>
          <CharacterLoadingOverlay
            show={starting}
            title={GUESS_WHO_SCREEN_COPY.startingLabel}
            message={startProgressMessage}
            stages={startProgressStages}
            testId="guess-who-start-progress"
          />
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
          <BackHomeLink className={styles.startBackHome} />
        </div>
      </div>
    );
  }

  // Before a reveal, the character shows only as the mystery placeholder — never its
  // real name or avatar, which live only inside the server-held token. A correct guess
  // or a game-over reveal swaps this for the real identity via lastEvent.
  const revealed =
    lastEvent?.type === "correct" || lastEvent?.type === "gameover" ? lastEvent : null;
  const gameBot: Bot = {
    name: revealed ? displayCharacterName(revealed.revealedName) : GUESS_WHO_MYSTERY_NAME,
    personality: "",
    avatarUrl: revealed?.avatarUrl ?? GUESS_WHO_FALLBACK_AVATAR,
    voiceConfig: null,
    gender: revealed?.gender ?? null,
  };

  const menuItems = (
    <>
      <button className={styles.menuItemLink} type="button" onClick={handleBackToHome}>
        <FaHome size={18} className="menuIcon" />
        <span>Back to Home</span>
      </button>
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

  const belowName = (
    <div className={styles.streakBadge} data-testid="guess-who-streak-badge">
      <span className={styles.streakValue}>
        {GUESS_WHO_STREAK_LABEL}: {displayedStreak}
      </span>
      {typeof highScore === "number" && highScore > 0 && (
        <span className={styles.highScoreBadge} data-testid="guess-who-high-score-badge">
          · Best: {highScore}
        </span>
      )}
    </div>
  );

  const bannerContent = (
    <>
      {awaitingContinue && lastEvent?.type === "correct" && (
        <div className={styles.correctGuessBanner} data-testid="guess-who-event-correct">
          <span className={styles.correctGuessText}>
            {fillTemplate(GUESS_WHO_CORRECT_BANNER, {
              revealedName: displayCharacterName(lastEvent.revealedName),
              streak: lastEvent.streak,
            })}
          </span>
          <button
            type="button"
            className={styles.correctGuessContinueButton}
            onClick={continueRound}
            data-testid="guess-who-continue-button"
          >
            {GUESS_WHO_SCREEN_COPY.continueLabel}
          </button>
        </div>
      )}
      {/* The next round isn't generated until "Continue" is clicked, so this reuses the
          exact same lightbox the start screen uses above. */}
      <CharacterLoadingOverlay
        show={continuing}
        title={GUESS_WHO_SCREEN_COPY.continuingLabel}
        message={continueProgressMessage}
        stages={continueProgressStages}
        testId="guess-who-continue-progress"
      />
      {lastEvent?.type === "wrong" && (
        <div className={styles.eventBanner} data-testid="guess-who-event-wrong">
          {GUESS_WHO_SCREEN_COPY.wrongBanner}
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
          <GameInstructionsModal
            show={showInstructions}
            onClose={closeInstructions}
            copy={GUESS_WHO_INSTRUCTIONS}
          />
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
      isSpeechSupported={isSpeechSupported}
      isRecording={isRecording}
      onMicToggle={handleMicToggle}
      error={error}
      retrying={false}
    />
  );
}

export default GuessWhoPage;
