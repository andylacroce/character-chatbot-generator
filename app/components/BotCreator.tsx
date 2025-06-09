"use client";

import React, { useState, useRef, useEffect } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
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
  let personality = `You are ${name}. Respond as this character would: use their worldview, emotional state, knowledge, quirks, and conversational style. Stay deeply in character at all times. Make your replies emotionally rich, context-aware, and natural—like real conversation. Adapt your tone and content to the situation and the user's input. Never break character or refer to yourself as an AI or chatbot.`;
  try {
    const personalityRes = await fetch("/api/generate-personality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (personalityRes.ok) {
      const data = await personalityRes.json();
      if (data.personality) personality = data.personality;
    }
  } catch (e) { /* fallback to default */ }

  // 2. Generate an avatar image using OpenAI (DALL-E)
  let avatarUrl = "/silhouette.svg"; // Updated default avatar
  try {
    const avatarRes = await fetch("/api/generate-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
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
    voiceConfig = await api_getVoiceConfigForCharacter(name);
  } catch (e) {
    // fallback: leave as null
  }
  return { name, personality, avatarUrl, voiceConfig };
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

async function generateBotDataWithProgress(name: string, onProgress: (step: string) => void): Promise<Bot> {
  let personality = `You are ${name}. Respond as this character would: use their worldview, emotional state, knowledge, quirks, and conversational style. Stay deeply in character at all times. Make your replies emotionally rich, context-aware, and natural—like real conversation. Adapt your tone and content to the situation and the user's input. Never break character or refer to yourself as an AI or chatbot.`;
  onProgress("personality");
  try {
    const personalityRes = await fetch("/api/generate-personality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (personalityRes.ok) {
      const data = await personalityRes.json();
      if (data.personality) personality = data.personality;
      // Log the generated prompt/personality to both browser and server console
      if (typeof window !== 'undefined') {
        console.log(`[BotCreator] Generated prompt/personality for '${name}':`, personality);
      }
      try {
        // Truncate only for logging, not for actual app logic
        const logPrefix = `[PROMPT] ${name}: `;
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
      body: JSON.stringify({ name }),
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
    voiceConfig = await api_getVoiceConfigForCharacter(name);
  } catch (e) {}
  return { name, personality, avatarUrl, voiceConfig };
}

const BotCreator: React.FC<BotCreatorProps> = ({ onBotCreated }) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    try {
      const bot = await generateBotDataWithProgress(input.trim(), setProgress);
      setProgress(null);
      onBotCreated(bot);
    } catch (e) {
      setError("Failed to generate character. Please try again.");
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = progressSteps.find((s) => s.key === progress);

  return (
    <form
      onSubmit={handleCreate}
      className={styles.formContainer}
      autoComplete="off"
      style={{ margin: "2.5rem auto 0 auto", maxWidth: 420, textAlign: "center" }}
    >
      <h1 className={styles.mainHeading}>Character Chatbot Generator</h1> {/* Added H1 heading */}
      <h2 className={styles.heading}>Create a Character</h2>
      <div className={styles.inputGroup}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter a name"
          className={styles.input}
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
        >
          Create
        </button>
      </div>
      <div className={styles.instructions}>
        Enter a real or fictional person, character, or invent your own. The app will generate a unique chatbot with a custom personality, portrait, and voice.
      </div>
      {loading && currentStep && (
        <div className={styles.progressContainer} data-testid="bot-creator-progress">
          <span className={styles.genericSpinner} aria-label="Loading" />
          <div className={styles.progressText}>{currentStep.label}</div>
          <div className={styles.progressDescription}>{currentStep.description}</div>
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </form>
  );
};

export type { Bot };
export default BotCreator;
