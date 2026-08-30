import storage from "./storage";
import type { CharacterVoiceConfig } from "./characterVoices";
import { voiceConfigKey } from "./storageKeys";

const VOICE_CONFIG_VERSION = 1;

function canUseDocument(): boolean {
  try {
    return typeof document !== "undefined" && typeof document.cookie === "string";
  } catch {
    return false;
  }
}

function getCookie(name: string): string | null {
  if (!canUseDocument()) return null;
  try {
    const cookies = document.cookie ? document.cookie.split(";") : [];
    for (const entry of cookies) {
      const [rawKey, ...rest] = entry.trim().split("=");
      if (rawKey === name) {
        return decodeURIComponent(rest.join("="));
      }
    }
  } catch {
    return null;
  }
  return null;
}

function setCookie(name: string, value: string, days = 7) {
  if (!canUseDocument()) return;
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax`;
  } catch {
    // Ignore cookie write failures
  }
}

function encodePayload(payload: unknown): string | null {
  try {
    const json = JSON.stringify({ v: VOICE_CONFIG_VERSION, payload });
    return typeof btoa === "function" ? btoa(json) : json;
  } catch {
    return null;
  }
}

function decodePayload(raw: string | null): CharacterVoiceConfig | null {
  if (!raw) return null;
  try {
    const decoded = typeof atob === "function" ? atob(raw) : raw;
    const parsed = JSON.parse(decoded) as { v?: number; payload?: unknown };
    if (parsed && typeof parsed === "object" && parsed.payload && typeof parsed.v === "number") {
      return parsed.payload as CharacterVoiceConfig;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadVoiceConfig(botName: string): CharacterVoiceConfig | null {
  if (!botName) return null;
  try {
    const versioned = storage.getVersionedJSON<CharacterVoiceConfig>(voiceConfigKey(botName));
    if (versioned?.payload) return versioned.payload;
  } catch {
    // ignore
  }
  const fromCookie = decodePayload(getCookie(voiceConfigKey(botName)));
  if (fromCookie) {
    try { storage.setVersionedJSON(voiceConfigKey(botName), fromCookie, VOICE_CONFIG_VERSION); } catch {}
    return fromCookie;
  }
  return null;
}

export function persistVoiceConfig(botName: string, config: CharacterVoiceConfig) {
  if (!botName || !config) return;
  try { storage.setVersionedJSON(voiceConfigKey(botName), config, VOICE_CONFIG_VERSION); } catch {}
  const encoded = encodePayload(config);
  if (encoded) setCookie(voiceConfigKey(botName), encoded, 14);
}

export function clearVoiceConfig(botName: string) {
  if (!botName) return;
  try { storage.removeItem(voiceConfigKey(botName)); } catch {}
  if (canUseDocument()) {
    try { document.cookie = `${voiceConfigKey(botName)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; samesite=lax`; } catch {}
  }
}
