"use client";

import React, { useState, useRef, useEffect, useContext } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { DarkModeContext } from "./DarkModeContext";
import { CHARACTER_VOICE_MAP } from "../../src/utils/characterVoices";
import styles from "./styles/BotCreator.module.css";

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
  async function getRandomCharacterName(): Promise<string> {
    try {
      const res = await fetch("/api/random-character");
      if (!res.ok) throw new Error("Failed to fetch random character");
      const data = await res.json();
      if (data && typeof data.name === "string" && data.name.trim()) {
        return data.name.trim();
      }
      throw new Error("No character name returned");
    } catch (e) {
      // fallback to static known character
      const names = Object.keys(CHARACTER_VOICE_MAP).filter(n => n !== "Default");
      return names[Math.floor(Math.random() * names.length)] || "Yoda";
    }
  }

  async function getRandomCharacterNameAvoidRepeat(lastName: string, maxTries = 3): Promise<string> {
    let tries = 0;
    let name = lastName;
    while (tries < maxTries) {
      try {
        // Add cache-busting query param
        const res = await fetch(`/api/random-character?cb=${Date.now()}-${Math.random()}`);
        const data = await res.json();
        if (data && typeof data.name === "string" && data.name.trim() && data.name.trim() !== lastName) {
          return data.name.trim();
        }
        // If fallback, still check for repeat
        if (data && typeof data.name === "string" && data.name.trim()) {
          name = data.name.trim();
        }
      } catch (e) {
        // fallback to static known character
        const names = Object.keys(CHARACTER_VOICE_MAP).filter(n => n !== "Default" && n !== lastName);
        if (names.length > 0) {
          name = names[Math.floor(Math.random() * names.length)];
        } else {
          name = "Yoda";
        }
        if (name !== lastName) return name;
      }
      tries++;
    }
    // If all tries fail, return whatever we got (even if repeated)
    return name;
  }

  const handleRandomCharacter = async () => {
    setRandomizing(true);
    setError("");
    try {
      const randomName = await getRandomCharacterNameAvoidRepeat(lastRandomNameRef.current);
      setInput(randomName);
      lastRandomNameRef.current = randomName;
    } catch (e) {
      setError("Failed to get random character");
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
            Create any character you can imagine: real, fictional, or brand new!
          </div>
          <div>
            Enter a name and click <b>Generate</b> to give your character a unique personality, voice, and portrait.
          </div>
          <div className={styles.instructionsTip}>
            Tip: Try names from history, pop culture, or invent your own.
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
        <button
          type="button"
          className={styles.darkModeToggle}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setDarkMode(!darkMode)}
        >
          {/* Icon and text both represent the mode the user will switch to */}
          {darkMode ? (
            // Show sun icon and "Light Mode" text when in dark mode (switch to light)
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span style={{ fontSize: '1rem', marginLeft: '0.5em' }}>Light Mode</span>
            </>
          ) : (
            // Show moon icon and "Dark Mode" text when in light mode (switch to dark)
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
              <span style={{ fontSize: '1rem', marginLeft: '0.5em' }}>Dark Mode</span>
            </>
          )}
        </button>
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
