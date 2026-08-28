"use client";

/**
 * Lets a signed-in user continue one of their previously created characters
 * from the landing page, instead of creating a new one. Renders nothing for
 * guests, while the session is loading, or once loaded if the user has no
 * saved characters yet.
 *
 * Only restores the character's identity (name/personality/avatar/voice) —
 * chat history isn't persisted server-side yet (see CLAUDE.md, phase 3c), so
 * on a new device the resumed conversation starts empty. Reuses the exact
 * same activation path as creating a brand-new character (the onSelect
 * callback is BotCreator's own onBotCreated), so there's no separate "load an
 * existing bot" code path to keep in sync.
 */

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../src/utils/api";
import type { Bot } from "./BotCreator";
import type { CharacterVoiceConfig } from "../../src/utils/characterVoices";
import styles from "./styles/BotCreator.module.css";

interface PersistedBot {
  id: string;
  name: string;
  personality: string;
  avatarUrl: string | null;
  gender: string | null;
  voiceConfig: CharacterVoiceConfig | null;
  updatedAt: string;
}

interface ResumeBotDropdownProps {
  onSelect: (bot: Bot) => void;
}

/** Formats an ISO timestamp as a friendly relative time (e.g. "a few minutes ago", "yesterday"). */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 5) return "a few minutes ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr === 1) return "an hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString();
}

const ResumeBotDropdown: React.FC<ResumeBotDropdownProps> = ({ onSelect }) => {
  const { status } = useSession();
  const [bots, setBots] = useState<PersistedBot[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setBots(null);
      return;
    }
    let mounted = true;
    authenticatedFetch("/api/bots")
      .then((res) => res.json())
      .then((data) => {
        if (mounted && Array.isArray(data?.bots)) setBots(data.bots);
      })
      .catch(() => {
        if (mounted) setBots([]);
      });
    return () => {
      mounted = false;
    };
  }, [status]);

  if (status !== "authenticated" || !bots || bots.length === 0) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = bots.find((b) => b.id === e.target.value);
    if (!selected) return;
    onSelect({
      name: selected.name,
      personality: selected.personality,
      avatarUrl: selected.avatarUrl || "/silhouette.svg",
      voiceConfig: selected.voiceConfig,
      gender: selected.gender,
    });
  };

  return (
    <div className={styles.inputGroup} data-testid="resume-bot-dropdown">
      <select
        className={styles.input}
        aria-label="Continue a previous conversation"
        defaultValue=""
        onChange={handleChange}
      >
        <option value="" disabled>
          Continue a previous conversation
        </option>
        {bots.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} — {formatRelativeTime(b.updatedAt)}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ResumeBotDropdown;
