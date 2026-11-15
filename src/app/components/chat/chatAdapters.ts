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
    if (!res.ok) throw httpError(res.status);
    return res.json();
  },
  async fetchHistory(botName) {
    const res = await authenticatedFetch(`/api/messages?botName=${encodeURIComponent(botName)}`);
    return parseChatMessages((await res.json())?.messages);
  },
  fetchVoiceConfig: (bot) => api_getVoiceConfigForCharacter(bot.name, bot.gender, bot.personality),
};

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
