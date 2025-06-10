"use client";

import React, { useState, useRef, useEffect, useContext } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { DarkModeContext } from "./DarkModeContext";
import { CHARACTER_VOICE_MAP } from "../../src/utils/characterVoices";
import styles from "./styles/BotCreator.module.css";
import DarkModeToggle from "./DarkModeToggle";

interface Bot {
  name: string;
  personality: string;
  avatarUrl: string;
  voiceConfig: any; // Use CharacterVoiceConfig if you want to import the type
}

interface BotCreatorProps {
  onBotCreated: (bot: Bot) => void;
}

// Real AI generation for personality and avatar
async function generateBotData(name: string): Promise<Bot> {
  // 1. Generate a personality prompt using OpenAI
  let personality = `You are ${name}. Respond as this character would: use their worldview, emotional state, knowledge, quirks, and conversational style. Stay deeply in character at all times. Make your replies emotionally rich, context-aware, and natural—like real conversation. Adapt your tone and content to the situation and the user\'s input. Never break character or refer to yourself as an AI or chatbot.`;
  let correctedName = name; // Initialize correctedName with the input name
  try {
    const personalityRes = await fetch("/api/generate-personality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }), // Send original name for correction
    });
    if (personalityRes.ok) {
      const data = await personalityRes.json();
      if (data.personality) personality = data.personality;
      if (data.correctedName) correctedName = data.correctedName; // Capture the corrected name
    }
  } catch (e) { /* fallback to default */ }

  // 2. Generate an avatar image using OpenAI (DALL-E)
  // Use the correctedName for avatar generation
  let avatarUrl = "/silhouette.svg"; 
  try {
    const avatarRes = await fetch("/api/generate-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: correctedName }), // Only send name
    });
    if (avatarRes.ok) {
      const data = await avatarRes.json();
      if (data.avatarDataUrl) avatarUrl = data.avatarDataUrl;
      else if (data.avatarUrl) avatarUrl = data.avatarUrl;
    }
  } catch (e) { /* fallback to default */ }

  // 3. Fetch voice config
  let voiceConfig = null;
  try {
    // Use correctedName for voice config as well
    voiceConfig = await api_getVoiceConfigForCharacter(correctedName);
  } catch (e) {
    // fallback: leave as null
  }
  // Return the bot object with the correctedName
  return { name: correctedName, personality, avatarUrl, voiceConfig };
}

const progressSteps = [
  {
    key: "personality",
    label: "Creating personality...",
    description: "Designing a unique personality for your character."
  },
  {
    key: "avatar",
    label: "Generating portrait...",
    description: "Creating a visual portrait for your character."
  },
  {
    key: "voice",
    label: "Finding the perfect voice...",
    description: "Selecting a voice that matches your character."
  }
];

async function generateBotDataWithProgress(originalInputName: string, onProgress: (step: string) => void): Promise<Bot> {
  let personality = `You are ${originalInputName}. Respond as this character would: use their worldview, emotional state, knowledge, quirks, and conversational style. Stay deeply in character at all times. Make your replies emotionally rich, context-aware, and natural—like real conversation. Adapt your tone and content to the situation and the user\'s input. Never break character or refer to yourself as an AI or chatbot.`;
  let correctedName = originalInputName; // Initialize with original input
  onProgress("personality");
  try {
    const personalityRes = await fetch("/api/generate-personality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: originalInputName }), // Send original name for correction
    });
    if (personalityRes.ok) {
      const data = await personalityRes.json();
      if (data.personality) personality = data.personality;
      if (data.correctedName) {
        correctedName = data.correctedName; // Capture the corrected name
        console.log(`[BotCreator] Original name: '${originalInputName}', Corrected name: '${correctedName}'`);
      }
      // Log the generated prompt/personality to both browser and server console
      if (typeof window !== 'undefined') {
        console.log(`[BotCreator] Generated prompt/personality for '${correctedName}':`, personality);
      }
      try {
        // Truncate only for logging, not for actual app logic
        const logPrefix = `[PROMPT] ${correctedName}: `;
        const maxLogLength = 2000;
        let logText = logPrefix + personality;
        if (logText.length > maxLogLength) {
          // Truncate personality so the log entry fits the API limit
          const allowedPersonalityLength = maxLogLength - logPrefix.length;
          logText = logPrefix + personality.slice(0, allowedPersonalityLength - 3) + '...';
        }
        await fetch('/api/log-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: '[BotCreator]',
            text: logText,
            sessionId: 'bot-creation',
            sessionDatetime: new Date().toISOString(),
          })
        });
      } catch (e) {}
    }
  } catch (e) {}

  let avatarUrl = "/silhouette.svg";
  onProgress("avatar");
  try {
    const avatarRes = await fetch("/api/generate-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: correctedName }), // Only send name
    });
    if (avatarRes.ok) {
      const data = await avatarRes.json();
      if (data.avatarDataUrl) avatarUrl = data.avatarDataUrl;
      else if (data.avatarUrl) avatarUrl = data.avatarUrl;
    }
  } catch (e) {}

  let voiceConfig = null;
  onProgress("voice");
  try {
    voiceConfig = await api_getVoiceConfigForCharacter(correctedName);
  } catch (e) {}
  return { name: correctedName, personality, avatarUrl, voiceConfig };
}

const BotCreator: React.FC<BotCreatorProps> = ({ onBotCreated }) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [randomizing, setRandomizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { darkMode, setDarkMode } = useContext(DarkModeContext);
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
    cancelRequested.current = false;
    try {
      const bot = await generateBotDataWithProgressCancelable(input.trim(), setProgress, cancelRequested);
      if (!cancelRequested.current) {
        setProgress(null);
        onBotCreated(bot);
      }
    } catch (e) {
      if (!cancelRequested.current) {
        setError("Failed to generate character. Please try again.");
        setProgress(null);
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

  // Enhanced random character button logic using OpenAI
  // Returns { name, source: 'openai' | 'static' | 'fallback' }
  async function getRandomCharacterName(): Promise<{ name: string; source: string }> {
    try {
      const res = await fetch("/api/random-character");
      const data = await res.json();
      if (res.ok && data && typeof data.name === "string" && data.name.trim()) {
        // If requestId is present, and no error, it's openai or static
        if (data.requestId && !data.error) {
          // Heuristic: if name starts with [STATIC], it's static, else openai
          if (data.name.startsWith('[STATIC]')) {
            return { name: data.name.replace(/^\[STATIC\]\s*/, ''), source: 'static' };
          } else {
            return { name: data.name, source: 'openai' };
          }
        }
        // If error present, fallback
        if (data.error) {
          return { name: data.name, source: 'fallback' };
        }
        // Default to openai
        return { name: data.name, source: 'openai' };
      }
      throw new Error("No character name returned");
    } catch (e) {
      // fallback to static known character
      const names = Object.keys(CHARACTER_VOICE_MAP).filter(n => n !== "Default");
      return { name: names[Math.floor(Math.random() * names.length)] || "Yoda", source: 'fallback' };
    }
  }

  async function getRandomCharacterNameAvoidRepeat(lastName: string, maxTries = 3): Promise<{ name: string; source: string }> {
    let tries = 0;
    let name = lastName;
    let source = 'fallback';
    while (tries < maxTries) {
      try {
        // Add cache-busting query param
        const res = await fetch(`/api/random-character?cb=${Date.now()}-${Math.random()}`);
        const data = await res.json();
        if (res.ok && data && typeof data.name === "string" && data.name.trim() && data.name.trim() !== lastName) {
          if (data.requestId && !data.error) {
            if (data.name.startsWith('[STATIC]')) {
              return { name: data.name.replace(/^\[STATIC\]\s*/, ''), source: 'static' };
            } else {
              return { name: data.name, source: 'openai' };
            }
          }
          if (data.error) {
            return { name: data.name, source: 'fallback' };
          }
          return { name: data.name, source: 'openai' };
        }
        // If fallback, still check for repeat
        if (data && typeof data.name === "string" && data.name.trim()) {
          name = data.name.trim();
          source = data.error ? 'fallback' : 'openai';
        }
      } catch (e) {
        // fallback to static known character
        const names = Object.keys(CHARACTER_VOICE_MAP).filter(n => n !== "Default" && n !== lastName);
        if (names.length > 0) {
          name = names[Math.floor(Math.random() * names.length)];
        } else {
          name = "Yoda";
        }
        source = 'fallback';
        if (name !== lastName) return { name, source };
      }
      tries++;
    }
    // If all tries fail, return whatever we got (even if repeated)
    return { name, source };
  }

  const [randomSource, setRandomSource] = useState<string | null>(null);

  const handleRandomCharacter = async () => {
    setRandomizing(true);
    setError("");
    try {
      const { name, source } = await getRandomCharacterNameAvoidRepeat(lastRandomNameRef.current);
      setInput(name);
      setRandomSource(source);
      lastRandomNameRef.current = name;
    } catch (e) {
      setError("Failed to get random character");
      setRandomSource(null);
    } finally {
      setRandomizing(false);
    }
  };

  const currentStep = progressSteps.find((s) => s.key === progress);
  const isBusy = loading || randomizing;

  return (
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
            <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M10 14h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M15 11l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          type="button"
          className={styles.randomButton}
          disabled={isBusy}
          aria-label="Choose a random real character"
          onClick={handleRandomCharacter}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style={{display:'block'}}>
            <rect x="5" y="5" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
            <circle cx="9.5" cy="9.5" r="2" fill="currentColor"/>
            <circle cx="18.5" cy="9.5" r="2" fill="currentColor"/>
            <circle cx="9.5" cy="18.5" r="2" fill="currentColor"/>
            <circle cx="18.5" cy="18.5" r="2" fill="currentColor"/>
            <circle cx="14" cy="14" r="2" fill="currentColor"/>
          </svg>
          <span style={{display:'none'}}>🎲</span>
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
          <div className={styles.progressText}>Picking a real character…</div>
          <div className={styles.progressDescription}>Asking ChatGPT for a famous or iconic character from history, literature, or pop culture.</div>
        </div>
      )}
      {loading && currentStep && (
        <div className={styles.progressContainer} data-testid="bot-creator-progress">
          <span className={styles.genericSpinner} aria-label="Loading" />
          <div className={styles.progressText}>{currentStep.label}</div>
          <div className={styles.progressDescription}>{currentStep.description}</div>
          <button
            type="button"
            className={styles.createButton}
            style={{ marginTop: 16, maxWidth: 48, minWidth: 48, minHeight: 48, maxHeight: 48, width: 48, height: 48, borderRadius: '50%' }}
            aria-label="Cancel"
            onClick={handleCancel}
          >
            {/* Modern X/cancel SVG icon */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M9.5 9.5l9 9M18.5 9.5l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{display:'none'}}>Cancel</span>
          </button>
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.toggleRow}>
        <DarkModeToggle className={styles.darkModeToggle} />
      </div>
    </form>
  );
};

// Helper: cancelable version of generateBotDataWithProgress
async function generateBotDataWithProgressCancelable(originalInputName: string, onProgress: (step: string) => void, cancelRequested: React.MutableRefObject<boolean>): Promise<Bot> {
  let personality = `You are ${originalInputName}. Respond as this character would: use their worldview, emotional state, knowledge, quirks, and conversational style. Stay deeply in character at all times. Make your replies emotionally rich, context-aware, and natural—like real conversation. Adapt your tone and content to the situation and the user\'s input. Never break character or refer to yourself as an AI or chatbot.`;
  let correctedName = originalInputName;
  onProgress("personality");
  if (cancelRequested.current) throw new Error("cancelled");
  try {
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
  } catch (e) {}
  let avatarUrl = "/silhouette.svg";
  onProgress("avatar");
  if (cancelRequested.current) throw new Error("cancelled");
  try {
    const avatarRes = await fetch("/api/generate-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: correctedName }),
    });
    if (cancelRequested.current) throw new Error("cancelled");
    if (avatarRes.ok) {
      const data = await avatarRes.json();
      if (data.avatarDataUrl) avatarUrl = data.avatarDataUrl;
      else if (data.avatarUrl) avatarUrl = data.avatarUrl;
    }
  } catch (e) {}
  let voiceConfig = null;
  onProgress("voice");
  if (cancelRequested.current) throw new Error("cancelled");
  try {
    voiceConfig = await api_getVoiceConfigForCharacter(correctedName);
  } catch (e) {}
  if (cancelRequested.current) throw new Error("cancelled");
  return { name: correctedName, personality, avatarUrl, voiceConfig };
}

export type { Bot };
export default BotCreator;
