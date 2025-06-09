"use client";

import React, { useState } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";

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

const BotCreator: React.FC<BotCreatorProps> = ({ onBotCreated }) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!input.trim()) {
      setError("Please enter a famous figure's name.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const bot = await generateBotData(input.trim());
      onBotCreated(bot);
    } catch (e) {
      setError("Failed to generate bot. Try again.");
    } finally {
      setLoading(false);
    }
  };

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
      />
      <button onClick={handleCreate} style={{ marginLeft: 8, padding: 8, fontSize: 18 }} disabled={loading}>
        {loading ? "Creating..." : "Create"}
      </button>
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      {/* Remove the prompt preview from the view */}
      {/* (No prompt preview here) */}
    </div>
  );
};

export type { Bot };
export default BotCreator;
