"use client";

/**
 * Character Chatbot Generator - Character creation form component.
 *
 * Allows users to create a new chatbot persona by entering a name or choosing a random character.
 * Handles personality, avatar, and voice generation with progress feedback.
 *
 * @module BotCreator
 */

import React, { useRef, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authenticatedFetch } from "../../src/utils/api";
import styles from "./styles/BotCreator.module.css";
import DarkModeToggle from "./DarkModeToggle";
import AuthControl from "./AuthControl";
import ResumeBotDropdown from "./ResumeBotDropdown";
import DisclaimerModal from "./DisclaimerModal";
import CharacterInfoModal from "./CharacterInfoModal";
import { useBotCreation } from "./useBotCreation";
import { CopyrightWarningModal } from "./CopyrightWarningModal";

interface Bot {
  name: string;
  personality: string;
  avatarUrl: string;
  voiceConfig: import("../../src/utils/characterVoices").CharacterVoiceConfig | null;
  gender?: string | null;
  // True when created past a copyright warning/caution the user chose to override.
  // Never persisted server-side (shared avatar cache, Blob, or this user's own bots
  // row) — see useBotCreation.ts and app/index.tsx's handleBotCreated.
  skipPersistence?: boolean;
}

interface BotCreatorProps {
  onBotCreated: (bot: Bot) => void;
  returningToCreator?: boolean;
}

const progressSteps = [
  {
    key: "personality",
    label: "Creating personality"
  },
  {
    key: "avatar",
    label: "Generating portrait, this may take a minute"
  },
  {
    key: "voice",
    label: "Selecting voice"
  }
];


const BotCreator: React.FC<BotCreatorProps> = ({ onBotCreated, returningToCreator = false }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const nameFromUrl = searchParams?.get('name') || null;
  const {
    input, setInput, error, loading, progress,
    randomizing, loadingMessage, validating, validationResult, showValidationModal,
    handleCreate, handleCancel, handleRandomCharacter,
    handleValidationContinue, handleValidationCancel, handleValidationSuggestion
  } = useBotCreation(onBotCreated);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const currentStep = progressSteps.find((s) => s.key === progress);
  // Deliberately excludes `randomizing`: that request is near-instant, and gating the
  // input row / dropdown visibility on it caused a jarring flash and layout shift for a
  // loading state nobody actually perceives as "loading". `randomizing` still disables
  // the Random button itself, below, as lightweight double-click protection.
  const isBusy = loading || validating;
  const [elapsed, setElapsed] = useState<number>(0);
  const [MAX_AVATAR_SECONDS, setMaxAvatarSeconds] = useState<number | null>(null);
  // Guard flag only — never read by the render output, so a ref (not state) avoids an
  // unnecessary extra render on top of the one handleCreate() itself already triggers.
  const hasAutoSubmittedRef = useRef<boolean>(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [showCharacterInfoModal, setShowCharacterInfoModal] = useState(false);

  useEffect(() => {
    if (nameFromUrl && !input.trim()) {
      setInput(nameFromUrl);
    }
  }, [nameFromUrl, input, setInput]);

  useEffect(() => {
    if (returningToCreator) {
      setInput('');
    }
  }, [returningToCreator, setInput]);

  useEffect(() => {
    if (nameFromUrl && input === nameFromUrl && !hasAutoSubmittedRef.current && !isBusy && !returningToCreator) {
      hasAutoSubmittedRef.current = true;
      handleCreate();
    }
  }, [nameFromUrl, input, isBusy, returningToCreator, handleCreate]);
  useEffect(() => {
    // fetch server-side config (safe subset) so UI matches server timeout
    let mounted = true;
    authenticatedFetch('/api/config')
      .then(r => r.json())
      .then((data) => { if (mounted && data && typeof data.avatarTimeoutSeconds === 'number') setMaxAvatarSeconds(data.avatarTimeoutSeconds); })
      .catch(() => { /* ignore, fall back to 60 */ });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    // A ticking elapsed-seconds counter is inherently effect-driven (setInterval can't run
    // during render), so resetting it to 0 here whenever the timer starts/stops is the
    // actual side effect, not state that could be computed during render instead.
    let timer: number | null = null;
    if (loading && progress === 'avatar' && MAX_AVATAR_SECONDS !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(0);
      timer = window.setInterval(() => setElapsed((e) => Math.min(e + 1, MAX_AVATAR_SECONDS)), 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, [loading, progress, MAX_AVATAR_SECONDS]);

  return (
    <>
      <header className={styles.masthead}>
        <span className={styles.mastheadWord}>Character Chatbot Generator</span>
        <div className={styles.mastheadUtility}>
          <DarkModeToggle className={styles.ghostIcon} hideLabel />
          <AuthControl className={styles.ghostAuth} />
        </div>
      </header>
      <form
        onSubmit={handleCreate}
        className={styles.formContainer}
        autoComplete="off"
      >
        <div className={styles.hero}>
          <p className={styles.kicker}>Begin a conversation</p>
          <h1 className={styles.headline}>Who will you bring to life?</h1>
          <p className={styles.subhead}>
            Type any name. Public domain classics, myths, and historical figures work best, but feel free to go off script.
          </p>
        </div>

        <div className={styles.inputRow + (isBusy ? ' ' + styles.hideMobile : '')}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter a name"
            className={styles.inputField}
            disabled={loading}
            data-testid="bot-creator-input"
            aria-label="Character name"
            maxLength={36}
            ref={inputRef}
          />
          <div className={styles.textLinks}>
            <button
              type="button"
              className={styles.textLink}
              disabled={isBusy || randomizing}
              aria-label="Choose a random character name"
              onClick={handleRandomCharacter}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
                <circle cx="7" cy="7" r="1.15" fill="currentColor" />
                <circle cx="13" cy="7" r="1.15" fill="currentColor" />
                <circle cx="7" cy="13" r="1.15" fill="currentColor" />
                <circle cx="13" cy="13" r="1.15" fill="currentColor" />
                <circle cx="10" cy="10" r="1.15" fill="currentColor" />
              </svg>
              Random
            </button>
            <button
              type="submit"
              className={styles.textLinkPrimary}
              disabled={isBusy}
              data-testid="bot-creator-button"
              aria-label="Create character"
            >
              Create
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                <path d="M6 10h8M11 7l3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {validating && (
          <div className={styles.progressContainer} data-testid="bot-creator-validating">
            <span className={styles.genericSpinner} aria-label="Loading" />
            <div className={styles.progressText}>Validating character...</div>
          </div>
        )}
        {loading && currentStep && (
          <div className={styles.progressContainer} data-testid="bot-creator-progress">
            <span className={styles.genericSpinner} aria-label="Loading" />
            <div className={styles.progressText}>
              {loadingMessage || currentStep.label}
              {loading && progress === 'avatar' && MAX_AVATAR_SECONDS !== null && (
                <span className={styles.elapsedTime}>{elapsed < MAX_AVATAR_SECONDS ? ` (${elapsed}s)` : ` (${MAX_AVATAR_SECONDS}s max)`}</span>
              )}
            </div>
            <button
              type="button"
              className={styles.textLink}
              aria-label="Cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}

        {!isBusy && <ResumeBotDropdown onSelect={onBotCreated} />}

        <div className={styles.footerLinks}>
          <button
            type="button"
            aria-label="Which characters can I create?"
            onClick={() => setShowCharacterInfoModal(true)}
            className={styles.footerLink}
          >
            Which characters can I create?
          </button>
          <button
            type="button"
            aria-label="Read disclaimer"
            onClick={() => setShowDisclaimerModal(true)}
            className={styles.footerLink}
          >
            Disclaimer
          </button>
          <a href="/privacy" className={styles.footerLink}>
            Privacy
          </a>
        </div>
      </form>
      <DisclaimerModal show={showDisclaimerModal} onClose={() => setShowDisclaimerModal(false)} />
      <CharacterInfoModal show={showCharacterInfoModal} onClose={() => setShowCharacterInfoModal(false)} />

      {showValidationModal && validationResult && (
        <CopyrightWarningModal
          validation={validationResult}
          onContinue={handleValidationContinue}
          onCancel={handleValidationCancel}
          onSelectSuggestion={handleValidationSuggestion}
        />
      )}
    </>
  );
};


export type { Bot };
export default BotCreator;
