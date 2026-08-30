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
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../src/utils/api";
import styles from "./styles/BotCreator.module.css";
import DarkModeToggle from "./DarkModeToggle";
import AuthControl from "./AuthControl";
import ResumeBotDropdown, { type PersistedBot, persistedBotToBot } from "./ResumeBotDropdown";
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
  const { status: sessionStatus } = useSession();
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

  // Launching via /?name=X (e.g. the /chars "Chat with this character" link) should
  // read as going straight into a chat, not "landing on the creator page, which then
  // happens to fill itself in" — so the ordinary hero/input/footer UI stays hidden
  // for as long as a URL-driven launch is in flight. Falls back to showing the normal
  // form (pre-filled, with the error visible) if that launch actually fails, so the
  // user isn't left stuck looking at a spinner with no way to retry or edit the name.
  const isLaunchingFromUrl = Boolean(nameFromUrl) && !error && !returningToCreator;

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

  // Launching /?name=X (e.g. from the /chars "Chat with this character" link) should
  // resume a signed-in user's own saved character by that name if one exists — same
  // as picking it from ResumeBotDropdown's "Previously" list — rather than always
  // generating a fresh (and likely different) personality for a name that's already
  // been created. Falls back to a fresh handleCreate() for guests, or when no saved
  // match exists. Waits out sessionStatus === 'loading' so guests aren't misjudged
  // as signed-in before the session resolves.
  useEffect(() => {
    if (!nameFromUrl || input !== nameFromUrl || hasAutoSubmittedRef.current || isBusy || returningToCreator) return;
    if (sessionStatus === 'loading') return;
    hasAutoSubmittedRef.current = true;

    if (sessionStatus !== 'authenticated') {
      handleCreate();
      return;
    }

    // Tracks whether this invocation actually dispatched onBotCreated/handleCreate
    // before its cleanup ran — see the cleanup comment below for why that matters.
    let dispatched = false;
    authenticatedFetch('/api/bots')
      .then((res) => res.json())
      .then((data) => {
        const bots: PersistedBot[] = Array.isArray(data?.bots) ? data.bots : [];
        const match = bots.find((b) => b.name.toLowerCase() === nameFromUrl.toLowerCase());
        dispatched = true;
        if (match) {
          onBotCreated(persistedBotToBot(match));
        } else {
          handleCreate();
        }
      })
      .catch(() => {
        dispatched = true;
        handleCreate();
      });

    return () => {
      // React 18 Strict Mode runs every effect twice in dev (mount, cleanup,
      // mount again) without resetting refs in between. If this cleanup fires
      // while the /api/bots lookup above is still in flight (dispatched still
      // false), the *next* invocation would see hasAutoSubmittedRef already
      // true and bail immediately — and the in-flight lookup, once it does
      // resolve, has no way back into a component that already gave up
      // waiting for it. Net effect: nobody ever calls onBotCreated/
      // handleCreate, and the launch hangs on the loading screen forever.
      // Releasing the guard here (only when nothing was dispatched yet) lets
      // the next invocation actually retry the lookup for real. Once
      // `dispatched` is true, leave the guard alone — deliberately allows
      // that in-flight lookup to finish and dispatch normally instead of
      // racing a second one.
      if (!dispatched) {
        hasAutoSubmittedRef.current = false;
      }
    };
  }, [nameFromUrl, input, isBusy, returningToCreator, sessionStatus, handleCreate, onBotCreated]);
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
        {!isLaunchingFromUrl && (
          <>
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
          </>
        )}

        {isLaunchingFromUrl && !isBusy && (
          <div className={styles.progressContainer} data-testid="bot-creator-auto-launch">
            <span className={styles.genericSpinner} aria-label="Loading" />
            <div className={styles.progressText}>Loading {nameFromUrl}&hellip;</div>
          </div>
        )}

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

        {!isBusy && !isLaunchingFromUrl && <ResumeBotDropdown onSelect={onBotCreated} />}

        {!isLaunchingFromUrl && <div className={styles.footerLinks}>
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
          <a href="/chars" className={styles.footerLink}>
            Character Wall
          </a>
        </div>}
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
