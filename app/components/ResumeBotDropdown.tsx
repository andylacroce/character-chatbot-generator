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

// Exported so other launch points (e.g. BotCreator's ?name= auto-resume) can
// match this repo's `GET /api/bots` response shape without redefining it.
export interface PersistedBot {
  id: string;
  name: string;
  personality: string;
  avatarUrl: string | null;
  gender: string | null;
  voiceConfig: CharacterVoiceConfig | null;
  updatedAt: string;
}

/** Maps a `GET /api/bots` row onto the Bot shape onBotCreated/onSelect expect. */
export function persistedBotToBot(bot: PersistedBot): Bot {
  return {
    name: bot.name,
    personality: bot.personality,
    avatarUrl: bot.avatarUrl || "/silhouette.svg",
    voiceConfig: bot.voiceConfig,
    gender: bot.gender,
  };
}

interface ResumeBotDropdownProps {
  onSelect: (bot: Bot) => void;
}

/** Rows shown before collapsing behind a "Show N more" toggle. */
const VISIBLE_LIMIT = 5;

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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // No need to actively reset `bots`/`expanded` here — the render guard below already
    // hides everything whenever status isn't "authenticated", and a fresh fetch naturally
    // replaces stale data the next time status becomes "authenticated" again.
    if (status !== "authenticated") return;
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

  const handleSelect = (selected: PersistedBot) => {
    onSelect(persistedBotToBot(selected));
  };

  const hasMore = bots.length > VISIBLE_LIMIT;
  const visibleBots = expanded ? bots : bots.slice(0, VISIBLE_LIMIT);

  return (
    <div className={styles.tocSection} data-testid="resume-bot-dropdown">
      <p className={styles.tocLabel}>Previously</p>
      {visibleBots.map((b) => (
        <button
          key={b.id}
          type="button"
          className={styles.tocRow}
          onClick={() => handleSelect(b)}
        >
          <span className={styles.tocName}>{b.name}</span>
          <span className={styles.tocDots} aria-hidden="true" />
          <span className={styles.tocTime}>{formatRelativeTime(b.updatedAt)}</span>
        </button>
      ))}
      {hasMore && (
        <button
          type="button"
          className={styles.tocToggle}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less" : `Show ${bots.length - VISIBLE_LIMIT} more`}
        </button>
      )}
    </div>
  );
};

export default ResumeBotDropdown;
