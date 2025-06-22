"use client";

/**
 * Character Chatbot Generator - Character creation form component.
 *
 * Allows users to create a new chatbot persona by entering a name or choosing a random character.
 * Handles personality, avatar, and voice generation with progress feedback.
 *
 * @module BotCreator
 */

import React, { useState, useRef, useEffect, useContext } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { DarkModeContext } from "./DarkModeContext";
import styles from "./styles/BotCreator.module.css";
import DarkModeToggle from "./DarkModeToggle";

interface Bot {
  name: string;
  personality: string;
  avatarUrl: string;
  voiceConfig: import("../../src/utils/characterVoices").CharacterVoiceConfig | null;
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
    label: "Generating portrait"
  },
  {
    key: "voice",
    label: "Selecting voice"
  }
];

const BotCreator: React.FC<BotCreatorProps> = ({ onBotCreated }) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [randomizing, setRandomizing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { darkMode } = useContext(DarkModeContext);
  const cancelRequested = useRef(false);
  const lastRandomNameRef = useRef<string>("");

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) {
      setError("Please enter a name or character.");
      return;
    }
    setError("");
    setLoading(true);
    setProgress("personality");
    setLoadingMessage(null);
    cancelRequested.current = false;
    try {
      const bot = await generateBotDataWithProgressCancelable(
        input.trim(),
        setProgress,
        setLoadingMessage,
        cancelRequested
      );
      if (!cancelRequested.current) {
        setProgress(null);
        setLoadingMessage(null);
        onBotCreated(bot);
      }
    } catch {
      if (!cancelRequested.current) {
        setError("Failed to generate character. Please try again.");
        setProgress(null);
        setLoadingMessage(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    cancelRequested.current = true;
    setLoading(false);
    setProgress(null);
  };

  // Track a longer history of recent random names (in-memory, per session)
  const recentRandomNames: string[] = [];
  const RECENT_HISTORY_LIMIT = 10;

  async function getRandomCharacterNameAvoidRepeat(lastName: string, maxTries = 3): Promise<{ name: string }> {
    let tries = 0;
    let name = lastName;
    while (tries < maxTries) {
      try {
        // Pass recent history to API as exclusions
        const exclude = [...recentRandomNames, lastName].filter(Boolean).join(",");
        const res = await fetch(`/api/random-character?cb=${Date.now()}-${Math.random()}&exclude=${encodeURIComponent(exclude)}`);
        const data = await res.json();
        if (res.ok && data && typeof data.name === "string" && data.name.trim() && !recentRandomNames.includes(data.name.trim())) {
          name = data.name.replace(/^\[STATIC\]\s*/, '').trim();
          // Update recent history
          recentRandomNames.push(name);
          if (recentRandomNames.length > RECENT_HISTORY_LIMIT) recentRandomNames.shift();
          return { name };
        }
        // If fallback, still check for repeat
        if (data && typeof data.name === "string" && data.name.trim()) {
          name = data.name.trim();
        }
      } catch {
        // Always fallback to 'Gandalf' if API fails
        name = 'Gandalf';
        if (name.toLowerCase() !== lastName.toLowerCase() && !recentRandomNames.map(n => n.toLowerCase()).includes(name.toLowerCase())) {
          recentRandomNames.push(name);
          if (recentRandomNames.length > RECENT_HISTORY_LIMIT) recentRandomNames.shift();
          return { name };
        }
      }
      tries++;
    }
    // If all tries fail, return whatever we got (even if repeated)
    return { name };
  }

  const handleRandomCharacter = async () => {
    setRandomizing(true);
    setError("");
    try {
      const { name } = await getRandomCharacterNameAvoidRepeat(lastRandomNameRef.current);
      setInput(name);
      lastRandomNameRef.current = name;
    } catch {
      setError("Failed to get random character");
    } finally {
      setRandomizing(false);
    }
  };

  const currentStep = progressSteps.find((s) => s.key === progress);
  const isBusy = loading || randomizing;

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
            <div className={styles.progressText}>{loadingMessage || currentStep.label}</div>
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

// Helper: cancelable version of generateBotDataWithProgress
/**
 * Generates bot data (personality, avatar, voice) with progress callbacks and cancellation support.
 * @param {string} originalInputName - The character name input by the user.
 * @param {(step: string) => void} onProgress - Callback for progress step updates.
 * @param {React.MutableRefObject<boolean>} cancelRequested - Ref to signal cancellation.
 * @returns {Promise<Bot>} The generated bot object.
 */
async function generateBotDataWithProgressCancelable(
  originalInputName: string,
  onProgress: (step: string) => void,
  setLoadingMessage: (msg: string | null) => void,
  cancelRequested: React.MutableRefObject<boolean>
): Promise<Bot> {
  let personality = `You are ${originalInputName}. Always respond in character, using your unique style, knowledge, and quirks. Use your internal knowledge. Never break character or mention being an AI.`;
  let correctedName = originalInputName;
  onProgress("personality");
  setLoadingMessage("Creating personality");
  if (cancelRequested.current) throw new Error("cancelled");
  try {
    setLoadingMessage("Creating personality");
    const personalityRes = await fetch("/api/generate-personality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: originalInputName }),
    });
    if (cancelRequested.current) throw new Error("cancelled");
    if (personalityRes.ok) {
      const data = await personalityRes.json();
      if (data.personality) personality = data.personality;
      if (data.correctedName) correctedName = data.correctedName;
    }
  } catch { }
  onProgress("avatar");
  setLoadingMessage("Generating portrait");
  let avatarUrl = "/silhouette.svg";
  if (cancelRequested.current) throw new Error("cancelled");
  try {
    setLoadingMessage("Generating portrait");
    const avatarRes = await fetch("/api/generate-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: correctedName }),
    });
    if (cancelRequested.current) throw new Error("cancelled");
    if (avatarRes.ok) {
      const data = await avatarRes.json();
      if (data.avatarDataUrl) {
        avatarUrl = data.avatarDataUrl;
      } else if (data.avatarUrl) {
        avatarUrl = data.avatarUrl;
        if (data.avatarUrl === "/silhouette.svg") {
          setLoadingMessage("Using default image");
        }
      }
    } else {
      setLoadingMessage("Using default image");
    }
  } catch {
    setLoadingMessage("Using default image");
  }
  onProgress("voice");
  setLoadingMessage("Selecting voice");
  let voiceConfig = null;
  if (cancelRequested.current) throw new Error("cancelled");
  try {
    voiceConfig = await api_getVoiceConfigForCharacter(correctedName);
  } catch {
    setLoadingMessage("Using default voice");
  }
  if (cancelRequested.current) throw new Error("cancelled");
  return { name: correctedName, personality, avatarUrl, voiceConfig };
}

export type { Bot };
export default BotCreator;
