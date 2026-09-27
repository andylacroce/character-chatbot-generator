import { useCallback, useEffect, useRef, useState } from "react";
import storage from "../../utils/storage";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { loadVoiceConfig, persistVoiceConfig } from "../../utils/voiceConfigPersistence";
import type { CharacterVoiceConfig } from "../../utils/characterVoices";
import { STORAGE_KEYS } from "character-chatbot-shared";
import type { Bot } from "./BotCreator";

/**
 * Resolves and persists a character's voice config, with cookie + localStorage caching and
 * network fallback. Extracted out of useChatController.ts, which only ever consumes
 * `ensureVoiceConfig()` and needs `voiceConfigRef` for a diagnostic log field — the resolved
 * config itself is never rendered directly.
 */
export function useCharacterVoiceConfig(bot: Bot) {
  const [resolvedVoiceConfig, setResolvedVoiceConfig] = useState<CharacterVoiceConfig | null>(
    () => {
      try {
        const stored = loadVoiceConfig(bot.name);
        if (stored) return stored;
      } catch {}
      return bot.voiceConfig || null;
    },
  );
  const voiceConfigPromiseRef = useRef<Promise<CharacterVoiceConfig | null> | null>(null);
  const voiceConfigRef = useRef<CharacterVoiceConfig | null>(resolvedVoiceConfig);
  useEffect(() => {
    voiceConfigRef.current = resolvedVoiceConfig;
  }, [resolvedVoiceConfig]);

  const setAndPersistVoiceConfig = useCallback(
    (config: CharacterVoiceConfig | null) => {
      if (!config) {
        voiceConfigRef.current = null;
        setResolvedVoiceConfig(null);
        return null;
      }
      // Avoid redundant state updates to prevent render loops
      const current = voiceConfigRef.current;
      const isSame = current && JSON.stringify(current) === JSON.stringify(config);
      try {
        persistVoiceConfig(bot.name, config);
      } catch {}
      if (!isSame) {
        voiceConfigRef.current = config;
        setResolvedVoiceConfig(config);
      } else {
        voiceConfigRef.current = config;
      }
      return config;
    },
    [bot.name],
  );

  const ensureVoiceConfig = useCallback(async (): Promise<CharacterVoiceConfig | null> => {
    if (voiceConfigRef.current) return voiceConfigRef.current;
    if (voiceConfigPromiseRef.current) return voiceConfigPromiseRef.current;
    const promise = (async () => {
      try {
        const stored = loadVoiceConfig(bot.name);
        if (stored) return setAndPersistVoiceConfig(stored);
      } catch {
        /* ignore */
      }
      try {
        const savedBotRaw = storage.getItem(STORAGE_KEYS.bot);
        if (savedBotRaw) {
          const parsed = JSON.parse(savedBotRaw);
          if (parsed?.name === bot.name && parsed.voiceConfig) {
            return setAndPersistVoiceConfig(parsed.voiceConfig as CharacterVoiceConfig);
          }
        }
      } catch {
        /* ignore */
      }
      if (bot.voiceConfig) {
        return setAndPersistVoiceConfig(bot.voiceConfig as CharacterVoiceConfig);
      }
      try {
        const fetched = await api_getVoiceConfigForCharacter(bot.name, bot.gender, bot.personality);
        return setAndPersistVoiceConfig(fetched);
      } catch (err) {
        if (typeof window !== "undefined") {
          logEvent(
            "error",
            "voice_config_fetch_failed",
            "Failed to fetch voice config",
            sanitizeLogMeta({
              botName: bot.name,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
        return null;
      }
    })();
    voiceConfigPromiseRef.current = promise;
    const result = await promise;
    voiceConfigPromiseRef.current = null;
    return result;
  }, [bot.name, bot.gender, bot.personality, bot.voiceConfig, setAndPersistVoiceConfig]);

  // Reset and hydrate voice config when bot changes
  useEffect(() => {
    voiceConfigPromiseRef.current = null;
    let cancelled = false;
    const hydrate = async () => {
      try {
        const stored = loadVoiceConfig(bot.name);
        if (stored && !cancelled) {
          setAndPersistVoiceConfig(stored);
          return;
        }
      } catch {
        /* ignore */
      }
      if (bot.voiceConfig && !cancelled) {
        setAndPersistVoiceConfig(bot.voiceConfig as CharacterVoiceConfig);
        return;
      }
      if (!cancelled) {
        setResolvedVoiceConfig(null);
        await ensureVoiceConfig();
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [bot.name, bot.voiceConfig, setAndPersistVoiceConfig, ensureVoiceConfig]);

  return { ensureVoiceConfig, voiceConfigRef };
}
