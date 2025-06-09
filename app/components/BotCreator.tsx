"use client";

import React, { useState } from "react";
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
  let personality = `You are ${name}. Respond as this famous figure would, using their style, knowledge, and quirks.`;
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
  let avatarUrl = "/gandalf.jpg";
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
    description: "Crafting a unique personality for your character."
  },
  {
    key: "avatar",
    label: "Generating portrait...",
    description: "Painting a portrait worthy of Middle-earth."
  },
  {
    key: "voice",
    label: "Finding the perfect voice...",
    description: "Listening for the right voice in the wind."
  }
];

async function generateBotDataWithProgress(name: string, onProgress: (step: string) => void): Promise<Bot> {
  let personality = `You are ${name}. Respond as this famous figure would, using their style, knowledge, and quirks.`;
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
    }
  } catch (e) {}

  let avatarUrl = "/gandalf.jpg";
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

  const handleCreate = async () => {
    if (!input.trim()) {
      setError("Please enter a famous figure's name.");
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
      setError("Failed to generate bot. Try again.");
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = progressSteps.find((s) => s.key === progress);

  return (
    <div style={{ margin: "2rem auto", maxWidth: 400, textAlign: "center" }}>
      <h2>Create Your Chatbot</h2>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Enter a famous figure (e.g., Einstein)"
        style={{ padding: 8, width: "80%", fontSize: 18 }}
        disabled={loading}
        data-testid="bot-creator-input"
      />
      <button onClick={handleCreate} style={{ marginLeft: 8, padding: 8, fontSize: 18 }} disabled={loading} data-testid="bot-creator-button">
        {loading ? "Creating..." : "Create"}
      </button>
      {loading && currentStep && (
        <div className={styles.progressContainer} data-testid="bot-creator-progress">
          <img src="/ring.gif" alt="Loading..." className={styles.progressSpinner} />
          <div className={styles.progressText}>{currentStep.label}</div>
          <div className={styles.progressDescription}>{currentStep.description}</div>
        </div>
      )}
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
    </div>
  );
};

export type { Bot };
export default BotCreator;
