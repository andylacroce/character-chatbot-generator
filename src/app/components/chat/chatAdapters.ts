import { authenticatedFetch } from "../../../utils/api";
import storage from "../../../utils/storage";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { loadVoiceConfig, persistVoiceConfig } from "../../../utils/chat/voiceConfigPersistence";
import type { CharacterVoiceConfig } from "../../../utils/chat/characterVoices";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import {
  STORAGE_KEYS,
  chatHistoryKey,
  httpError,
  parseChatMessages,
  type Bot,
  type ChatLogger,
  type ChatStorage,
  type ChatTransport,
} from "character-chatbot-shared";

/** Web's `/api/chat` and history requests, through `authenticatedFetch` so `proxy.ts` auth applies. */
export const webChatTransport: ChatTransport = {
  async send(request) {
    const res = await authenticatedFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const body = await Promise.resolve()
        .then(() => res.json())
        .catch(() => null);
      throw httpError(res.status, typeof body?.code === "string" ? body.code : undefined);
    }
    return res.json();
  },
  async fetchHistory(botName) {
    const res = await authenticatedFetch(`/api/messages?botName=${encodeURIComponent(botName)}`);
    return parseChatMessages((await res.json())?.messages);
  },
  fetchVoiceConfig: (bot) => api_getVoiceConfigForCharacter(bot.name, bot.gender, bot.personality),
  async refreshPersona(bot) {
    const res = await authenticatedFetch("/api/generate-personality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bot.name }),
    });
    if (!res.ok) throw httpError(res.status);
    return res.json();
  },
};

/**
 * Stores a bot whose persona was just re-signed: over the saved copy on this device (when it is
 * the same character), and, fire-and-forget, to the signed-in user's account.
 */
export function saveRefreshedBot(bot: Bot, signedIn: boolean): void {
  try {
    const saved = storage.getJSON<Bot>(STORAGE_KEYS.bot);
    if (saved?.name === bot.name) storage.setJSON(STORAGE_KEYS.bot, { ...saved, ...bot });
  } catch (err) {
    logChat("warn", "chat_refreshed_bot_save_failed", "Failed to store refreshed character", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (!signedIn || bot.skipPersistence) return;
  authenticatedFetch("/api/bots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: bot.name,
      personality: bot.personality,
      personalitySignature: bot.personalitySignature,
      avatarUrl: bot.avatarUrl,
      gender: bot.gender,
      voiceConfig: bot.voiceConfig,
    }),
  }).catch(() => {});
}

/** The saved character's voice config when it is the one on this device. */
function savedBotVoiceConfig(botName: string): CharacterVoiceConfig | null {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEYS.bot) ?? "null");
    if (saved?.name === botName && saved.voiceConfig) return saved.voiceConfig;
  } catch {}
  return null;
}

/** Web's localStorage-backed transcript and voice-config cache. */
export const webChatStorage: ChatStorage = {
  load(botName) {
    try {
      const saved = storage.getItem(chatHistoryKey(botName));
      return saved ? parseChatMessages(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  },
  save: (botName, messages) => storage.setItem(chatHistoryKey(botName), JSON.stringify(messages)),
  loadVoiceConfig(botName) {
    try {
      return loadVoiceConfig(botName) ?? savedBotVoiceConfig(botName);
    } catch {
      return savedBotVoiceConfig(botName);
    }
  },
  saveVoiceConfig: persistVoiceConfig,
};

/** Logs through `logEvent` in the browser only (the chat also renders during SSR). */
export const logChat: ChatLogger = (level, event, message, meta) => {
  if (typeof window !== "undefined") logEvent(level, event, message, sanitizeLogMeta(meta ?? {}));
};
