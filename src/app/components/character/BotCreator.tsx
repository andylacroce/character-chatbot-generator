"use client";

/**
 * Portrayal - Character conversation launcher.
 *
 * Lets users select an established character by name or choose a random one.
 * Handles personality, avatar, and voice generation with progress feedback.
 *
 * @module BotCreator
 */

import React, { useCallback, useRef, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BRAND } from "character-chatbot-shared";
import styles from "../styles/BotCreator.module.css";
import AppHeader from "../common/AppHeader";
import LandingCharacterCarousel from "./LandingCharacterCarousel";
import DisclaimerModal from "../common/DisclaimerModal";
import CharacterInfoModal from "../chat/CharacterInfoModal";
import { useBotCreation } from "./useBotCreation";
import { useSpeechRecognition } from "../chat/useSpeechRecognition";
import { useAccountMenu } from "../account/useAccountMenu";
import { NameCaptureModal } from "../account/NameCaptureModal";
import { CopyrightWarningModal } from "./CopyrightWarningModal";
import CharacterLoadingOverlay from "./CharacterLoadingOverlay";
import { progressSteps, buildProgressStages } from "./botCreatorProgress";
import { useUrlLaunch } from "./useUrlLaunch";
import { ArrowIcon, DiceIcon, MicIcon, WallIcon } from "./BotCreatorIcons";
import { GamesPanel, LandingFooterLinks, LandingHero } from "./LandingSections";
import type { Bot } from "./botTypes";

export { persistedBotToBot } from "./botTypes";
export type { Bot, PersistedBot } from "./botTypes";

interface BotCreatorProps {
  onBotCreated: (bot: Bot) => void;
  returningToCreator?: boolean;
}

/** Landing-page character picker: name entry, random pick, and the Character Wall CTA. */
const BotCreator: React.FC<BotCreatorProps> = ({ onBotCreated, returningToCreator = false }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { status: sessionStatus } = useSession();
  // The visitor's own name/account menu (identity chip, change-name + sign-in/out items
  // and modals) — shared with CharsGallery.tsx and ChatPage.tsx's own account menus.
  // userNameCtx is passed into useBotCreation so it can pause handleCreate() with a
  // one-time gate the first time this browser doesn't know the visitor's name yet.
  const { userNameCtx, menuItems, modals, requestSignIn } = useAccountMenu();
  const {
    input,
    setInput,
    error,
    setError,
    loading,
    progress,
    randomizing,
    loadingMessage,
    validating,
    validationResult,
    showValidationModal,
    showNameGateModal,
    handleCreate,
    handleCancel,
    handleRandomCharacter,
    handleValidationContinue,
    handleValidationCancel,
    handleValidationSuggestion,
    handleNameGateSave,
    handleNameGateSkip,
  } = useBotCreation(onBotCreated, userNameCtx);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const currentStep = progressSteps.find((s) => s.key === progress);
  const progressStages = buildProgressStages(progress, loadingMessage);
  // Deliberately excludes `randomizing`: that request is near-instant, and gating the
  // input row visibility on it caused a jarring flash and layout shift for a
  // loading state nobody actually perceives as "loading". `randomizing` still disables
  // the Random button itself, below, as lightweight double-click protection.
  const isBusy = loading || validating;

  const {
    isSupported: isSpeechSupported,
    isRecording,
    transcript,
    error: speechError,
    stopRecording,
    toggleRecording,
  } = useSpeechRecognition();

  // Live-updates the name field with the in-progress dictation, mirroring
  // useChatController.ts/useGameController.ts's own mic wiring. Overwrites rather than
  // appends (see useSpeechRecognition.ts's doc comment). Synchronizes React state from
  // useSpeechRecognition's own external browser-API state, which can't be derived
  // during render. Unlike those two hooks, `setInput`/`setError` here come from
  // useBotCreation (not a local useState in this component), so
  // react-hooks/set-state-in-effect doesn't flag this and no disable comment is needed.
  useEffect(() => {
    if (isRecording) setInput(transcript);
  }, [isRecording, transcript, setInput]);

  // Routes a speech-recognition error through the same banner other creation errors use.
  useEffect(() => {
    if (speechError) setError(speechError);
  }, [speechError, setError]);

  // Hidden/no-op while validation or generation is already running (isBusy), the same
  // condition that already disables the Random/Create buttons on this form.
  const handleMicToggle = useCallback(() => {
    if (isBusy) return;
    toggleRecording();
  }, [isBusy, toggleRecording]);

  // Force-stops any in-progress dictation the moment a name is actually submitted,
  // mirroring useChatController.ts's sendMessage — the transcript has already landed in
  // `input` via the effect above, so this just prevents the recognizer from continuing
  // to run (and mutate `input` again) once creation has started.
  const handleFormSubmit = useCallback(
    (e?: { preventDefault(): void }) => {
      stopRecording();
      return handleCreate(e);
    },
    [stopRecording, handleCreate],
  );

  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [showCharacterInfoModal, setShowCharacterInfoModal] = useState(false);

  const { nameFromUrl, isLaunchingFromUrl, interstitial, handleCancelLaunch } = useUrlLaunch({
    input,
    setInput,
    isBusy,
    error,
    returningToCreator,
    sessionStatus,
    handleCreate,
    handleCancel,
    onBotCreated,
  });

  return (
    <>
      <AppHeader
        menuItems={menuItems}
        center={
          <span className={styles.headerBrand}>
            <span className={styles.headerWordmark}>{BRAND.name}</span>
            <span className={styles.betaBadge}>{BRAND.betaLabel}</span>
          </span>
        }
        wideCenter
      />
      <form onSubmit={handleFormSubmit} className={styles.formContainer} autoComplete="off">
        <LandingCharacterCarousel />
        <div className={styles.formInner}>
          {!isLaunchingFromUrl && !interstitial && (
            <div className={styles.landingLayout}>
              <section className={styles.creatorPanel} aria-labelledby="creator-heading">
                <LandingHero />

                <div className={styles.creationControls}>
                  <label className={styles.inputLabel} htmlFor="character-name">
                    Character name
                  </label>
                  <div className={styles.inputRow + (isBusy ? " " + styles.hideMobile : "")}>
                    <div className={styles.fieldShell}>
                      <input
                        id="character-name"
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="e.g. Cleopatra"
                        className={styles.inputField}
                        disabled={loading}
                        data-testid="bot-creator-input"
                        maxLength={36}
                        ref={inputRef}
                      />
                      {isSpeechSupported && !isBusy && (
                        <button
                          type="button"
                          onClick={handleMicToggle}
                          className={styles.micButton}
                          aria-label={isRecording ? "Stop voice input" : "Start voice input"}
                          aria-pressed={isRecording}
                          data-testid="bot-creator-mic-toggle"
                        >
                          <MicIcon recording={isRecording} />
                        </button>
                      )}
                    </div>
                    <div className={styles.textLinks}>
                      <button
                        type="button"
                        className={styles.textLink}
                        disabled={isBusy || randomizing}
                        aria-label="Choose a random character name"
                        onClick={handleRandomCharacter}
                      >
                        <DiceIcon />
                        Surprise me
                      </button>
                      <button
                        type="submit"
                        className={styles.textLinkPrimary}
                        disabled={isBusy}
                        data-testid="bot-creator-button"
                        aria-label="Start conversation"
                      >
                        Start conversation
                        <ArrowIcon />
                      </button>
                    </div>
                  </div>

                  <Link href="/characters" className={styles.wallCta}>
                    <WallIcon />
                    <span>
                      <strong>Character Wall</strong>
                      <small>Pick a portrait to chat</small>
                    </span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>

                {error && <div className={styles.error}>{error}</div>}
              </section>

              <GamesPanel />
            </div>
          )}

          <CharacterLoadingOverlay
            show={isLaunchingFromUrl && !isBusy && !interstitial}
            title="Loading character…"
            message={`Loading ${nameFromUrl}…`}
            stages={[]}
            testId="bot-creator-auto-launch"
          />

          {interstitial && (
            <CharacterLoadingOverlay
              show
              title={interstitial.kind === "resume" ? "Resuming chat…" : "Starting chat…"}
              message={
                interstitial.kind === "resume"
                  ? `Resuming your chat with ${interstitial.name}…`
                  : `Starting a new chat with ${interstitial.name}…`
              }
              stages={[]}
              testId="bot-creator-interstitial"
              onCancel={handleCancelLaunch}
            />
          )}

          <CharacterLoadingOverlay
            show={validating}
            title="Checking name…"
            message="Validating character..."
            stages={[]}
            testId="bot-creator-validating"
            onCancel={handleCancelLaunch}
          />
          <CharacterLoadingOverlay
            show={loading && Boolean(currentStep)}
            title="Creating your character…"
            message={loadingMessage || currentStep?.label || ""}
            stages={progressStages}
            testId="bot-creator-progress"
            onCancel={handleCancelLaunch}
          />
          {!isLaunchingFromUrl && !interstitial && (
            <LandingFooterLinks
              authenticated={sessionStatus === "authenticated"}
              onShowCharacterInfo={() => setShowCharacterInfoModal(true)}
              onShowDisclaimer={() => setShowDisclaimerModal(true)}
            />
          )}
        </div>
      </form>
      <DisclaimerModal show={showDisclaimerModal} onClose={() => setShowDisclaimerModal(false)} />
      <CharacterInfoModal
        show={showCharacterInfoModal}
        onClose={() => setShowCharacterInfoModal(false)}
      />

      {showValidationModal && validationResult && (
        <CopyrightWarningModal
          validation={validationResult}
          onContinue={handleValidationContinue}
          onCancel={handleValidationCancel}
          onSelectSuggestion={handleValidationSuggestion}
        />
      )}

      <NameCaptureModal
        show={showNameGateModal}
        onClose={handleNameGateSkip}
        mode="gate"
        currentName={userNameCtx.name}
        onSave={handleNameGateSave}
        onSkip={handleNameGateSkip}
        onRequestSignIn={requestSignIn}
      />
      {modals}
    </>
  );
};

export default BotCreator;
