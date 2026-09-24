import {
  generateCharacter,
  useCharacterCreation,
  type CharacterVoiceConfig,
  type CreationLogger,
  type CreationStep,
  type CreationTransport,
} from "character-chatbot-shared";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { authenticatedFetch } from "../../utils/api";
import type { Bot } from "./BotCreator";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { persistVoiceConfig } from "../../utils/voiceConfigPersistence";
import type { CharacterValidationResult } from "../../pages/api/validate-character";
import type { UserNameContext } from "./useUserName";

const DEFAULT_RANDOM_NAME = "Sherlock Holmes";

/** POSTs JSON, resolving the parsed body on success or null on a non-2xx reply. */
async function postJsonOrNull<T>(url: string, body: unknown): Promise<T | null> {
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
}

/** The web app's requests for character creation. */
const transport: CreationTransport = {
  async validate(name) {
    const failOpen = {
      characterName: name,
      isPublicDomain: true,
      isSafe: true,
      warningLevel: "none",
    } as CharacterValidationResult;
    try {
      const res = await authenticatedFetch("/api/validate-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return (res.ok ? await res.json() : null) ?? failOpen;
    } catch {
      return failOpen;
    }
  },
  async randomName() {
    try {
      const res = await authenticatedFetch(`/api/random-character`);
      const data = await res.json();
      if (res.ok && data) {
        // Prefer the API's chosen name, to match server logs; else pick a suggestion.
        if (typeof data.name === "string" && data.name.trim()) return data.name.trim();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          const choice = data.suggestions[Math.floor(Math.random() * data.suggestions.length)];
          if (typeof choice === "string" && choice.trim()) return choice.trim();
        }
      }
      return DEFAULT_RANDOM_NAME;
    } catch {
      return DEFAULT_RANDOM_NAME;
    }
  },
  generatePersonality: (request) => postJsonOrNull("/api/generate-personality", request),
  generateAvatar: (request) => postJsonOrNull("/api/generate-avatar", request),
  getVoiceConfig: (name, gender, voiceContext) =>
    api_getVoiceConfigForCharacter(name, gender, voiceContext),
};

/** Structured logging for creation events; `debug` events only outside production. */
const log: CreationLogger = (level, event, message, meta = {}) => {
  if (typeof window === "undefined") return;
  if (level === "debug") {
    if (process.env.NODE_ENV === "production") return;
    logEvent(event.endsWith("_failed") ? "warn" : "info", event, message, sanitizeLogMeta(meta));
    return;
  }
  logEvent(level, event, message, sanitizeLogMeta(meta));
};

/** Caches a finished character's voice (localStorage with cookie fallback). */
function cacheVoice(bot: { name: string; voiceConfig: CharacterVoiceConfig | null }) {
  if (bot.voiceConfig) persistVoiceConfig(bot.name, bot.voiceConfig);
}

/**
 * Drives BotCreator's character-creation flow: character-chatbot-shared's
 * useCharacterCreation (shared with the mobile app) over the web app's requests.
 */
export function useBotCreation(onBotCreated: (bot: Bot) => void, userNameCtx: UserNameContext) {
  return useCharacterCreation({
    transport,
    onCreated: onBotCreated,
    userNameCtx,
    log,
    onVoiceConfig: cacheVoice,
  });
}

/**
 * Runs the personality/avatar/voice pipeline for a character, reporting progress and
 * honoring cancellation, then caches the voice. The pipeline itself is the shared
 * generateCharacter.
 */
export async function generateBotDataWithProgressCancelable(
  originalInputName: string,
  onProgress: (step: CreationStep) => void,
  setLoadingMessage: (msg: string | null) => void,
  cancelToken: { cancelled: boolean } | null,
  skipPersistence: boolean = false,
  description?: string,
  appearance?: string,
  recognized: boolean = true,
): Promise<Bot> {
  const bot = await generateCharacter(transport, originalInputName, {
    onProgress,
    setLoadingMessage,
    cancelToken,
    skipPersistence,
    description,
    appearance,
    recognized,
    log,
  });
  try {
    cacheVoice(bot);
  } catch {}
  return bot as Bot;
}
