"use client";

/**
 * Character Chatbot Generator - Character creation form component.
 *
 * Allows users to create a new chatbot persona by entering a name or choosing a random character.
 * Handles personality, avatar, and voice generation with progress feedback.
 *
 * @module BotCreator
 */

import React, { useRef, useEffect, useContext, useState } from "react";
import { DarkModeContext } from "./DarkModeContext";
import styles from "./styles/BotCreator.module.css";
import DarkModeToggle from "./DarkModeToggle";
import { useBotCreation } from "./useBotCreation";

interface Bot {
  name: string;
  personality: string;
  avatarUrl: string;
  voiceConfig: import("../../src/utils/characterVoices").CharacterVoiceConfig | null;
  gender?: string | null;
}

interface BotCreatorProps {
  onBotCreated: (bot: Bot) => void;
}

const progressSteps = [
  {
    key: "personality",
    label: "Creating personality"
  },
  {
    key: "avatar",
    label: "Generating portrait — this may take a minute"
  },
  {
    key: "voice",
    label: "Selecting voice"
  }
];


const BotCreator: React.FC<BotCreatorProps> = ({ onBotCreated }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { darkMode } = useContext(DarkModeContext);
  const {
    input, setInput, error, loading, progress,
    randomizing, loadingMessage,
    handleCreate, handleCancel, handleRandomCharacter
  } = useBotCreation(onBotCreated);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const currentStep = progressSteps.find((s) => s.key === progress);
  const isBusy = loading || randomizing;
  const [elapsed, setElapsed] = useState<number>(0);
  const [MAX_AVATAR_SECONDS, setMaxAvatarSeconds] = useState<number | null>(null);
  useEffect(() => {
    // fetch server-side config (safe subset) so UI matches server timeout
    let mounted = true;
    fetch('/api/config')
      .then(r => r.json())
      .then((data) => { if (mounted && data && typeof data.avatarTimeoutSeconds === 'number') setMaxAvatarSeconds(data.avatarTimeoutSeconds); })
      .catch(() => { /* ignore, fall back to 60 */ });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    let timer: number | null = null;
    if (loading && progress === 'avatar' && MAX_AVATAR_SECONDS !== null) {
      setElapsed(0);
      timer = window.setInterval(() => setElapsed((e) => Math.min(e + 1, MAX_AVATAR_SECONDS)), 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, [loading, progress, MAX_AVATAR_SECONDS]);

  return (
    <>
      <form
        onSubmit={handleCreate}
        className={styles.formContainer}
        autoComplete="off"
      >
        <h1 className={styles.mainHeading}>Character Chatbot Generator</h1>
        <div className={styles.inputGroup}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter a name"
            className={styles.input + (darkMode ? ' dark' : '')}
            disabled={loading}
            data-testid="bot-creator-input"
            aria-label="Character name"
            maxLength={36}
            ref={inputRef}
          />
        </div>
        <div className={styles.buttonRow + (isBusy ? ' ' + styles.hideMobile : '')}>
          <button
            type="submit"
            className={styles.createButton}
            disabled={isBusy}
            data-testid="bot-creator-button"
            aria-label="Create character"
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M10 14h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M15 11l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.randomButton}
            disabled={isBusy}
            aria-label="Choose a random real character"
            onClick={handleRandomCharacter}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
              <rect x="5" y="5" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
              <circle cx="9.5" cy="9.5" r="2" fill="currentColor" />
              <circle cx="18.5" cy="9.5" r="2" fill="currentColor" />
              <circle cx="9.5" cy="18.5" r="2" fill="currentColor" />
              <circle cx="18.5" cy="18.5" r="2" fill="currentColor" />
              <circle cx="14" cy="14" r="2" fill="currentColor" />
            </svg>
            <span style={{ display: 'none' }}>🎲</span>
          </button>
        </div>
        {!(loading || randomizing) && (
          <div className={styles.instructionsCentered}>
            <div>
              Choose a character name to create your own chatbot. You can invent a new personality or use someone famous.
            </div>
            <div>
              Press the <b>arrow</b> button to generate your character, or try the <b>dice</b> button for a random suggestion.
            </div>
            <div className={styles.instructionsTip}>
              Explore different names from books, movies, history, or your imagination.
            </div>
          </div>
        )}
        {randomizing && (
          <div className={styles.progressContainer} data-testid="bot-creator-progress">
            <span className={styles.genericSpinner} aria-label="Loading" />
            <div className={styles.progressText}>Picking a random character</div>
          </div>
        )}
        {loading && currentStep && (
          <div className={styles.progressContainer} data-testid="bot-creator-progress">
            <span className={styles.genericSpinner} aria-label="Loading" />
            <div className={styles.progressText}>
              {loadingMessage || currentStep.label}
              {loading && progress === 'avatar' && MAX_AVATAR_SECONDS !== null && (
                <span style={{ opacity: 0.85 }}>{elapsed < MAX_AVATAR_SECONDS ? ` (${elapsed}s)` : ` (${MAX_AVATAR_SECONDS}s max)`}</span>
              )}
            </div>
            <button
              type="button"
              className={styles.createButton}
              style={{ marginTop: 16, maxWidth: 48, minWidth: 48, minHeight: 48, maxHeight: 48, width: 48, height: 48, borderRadius: '50%' }}
              aria-label="Cancel"
              onClick={handleCancel}
            >
              {/* Modern X/cancel SVG icon */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M9.5 9.5l9 9M18.5 9.5l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ display: 'none' }}>Cancel</span>
            </button>
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.toggleRow}>
          <DarkModeToggle className={styles.darkModeToggle} />
        </div>
      </form>
      <div className={styles.disclaimer}>
        Disclaimer: This chatbot is for entertainment purposes only. No information provided should be considered professional, legal, medical, or financial advice. Content may be generated by artificial intelligence (OpenAI) and may contain inaccuracies or limitations. Use at your own risk. The creators disclaim all liability for actions taken based on chatbot interactions.
      </div>
    </>
  );
};


export type { Bot };
export default BotCreator;
