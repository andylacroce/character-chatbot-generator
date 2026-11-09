import type { CharacterVoiceConfig } from "../../../utils/chat/characterVoices";

/** A character ready to chat with. */
export interface Bot {
  name: string;
  personality: string;
  avatarUrl: string;
  voiceConfig: CharacterVoiceConfig | null;
  gender?: string | null;
  // True when created past a copyright warning/caution the user chose to override.
  // Never persisted server-side (shared avatar cache, Blob, or this user's own bots
  // row) — see useBotCreation.ts and app/index.tsx's handleBotCreated.
  skipPersistence?: boolean;
}

/** A `GET /api/bots` row — a signed-in user's saved character. */
export interface PersistedBot {
  id: string;
  name: string;
  personality: string;
  avatarUrl: string | null;
  gender: string | null;
  voiceConfig: CharacterVoiceConfig | null;
  updatedAt: string;
}

/** Maps a `GET /api/bots` row onto the Bot shape onBotCreated expects. */
export function persistedBotToBot(bot: PersistedBot): Bot {
  return {
    name: bot.name,
    personality: bot.personality,
    avatarUrl: bot.avatarUrl || "/silhouette.svg",
    voiceConfig: bot.voiceConfig,
    gender: bot.gender,
  };
}
