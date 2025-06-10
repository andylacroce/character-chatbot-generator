"use client";

import React, { useState, useRef, useEffect, useContext } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { DarkModeContext } from "./DarkModeContext";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const { darkMode, setDarkMode } = useContext(DarkModeContext);
  const cancelRequested = useRef(false);

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

  const currentStep = progressSteps.find((s) => s.key === progress);

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
        <button
          type="submit"
          className={styles.createButton}
          disabled={loading}
          data-testid="bot-creator-button"
          aria-label="Create character"
        >
          {/* Submit/Proceed icon: right arrow in a circle */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M10 14h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M15 11l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      {!loading && (
        <div className={styles.instructions}>
          Create any character you can imagine: real, fictional, or brand new!<br />
          Enter a name and click <b>Generate</b> to give your character a unique personality, voice, and portrait.<br />
          <span style={{color: '#7fa7c7'}}>Tip: Try names from history, pop culture, or invent your own.</span>
        </div>
      )}
      {loading && currentStep && (
        <div className={styles.progressContainer} data-testid="bot-creator-progress">
          <span className={styles.genericSpinner} aria-label="Loading" />
          <div className={styles.progressText}>{currentStep.label}</div>
          <div className={styles.progressDescription}>{currentStep.description}</div>
          <button type="button" className={styles.createButton} style={{marginTop: 16, maxWidth: 180}} onClick={handleCancel}>
            Cancel
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
          {darkMode ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" stroke="currentColor" strokeWidth="2" fill="none"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2"/>
            </svg>
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
