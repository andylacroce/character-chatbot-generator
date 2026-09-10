/**
 * Persists a character's voice config to both localStorage (primary) and a cookie
 * (fallback, for environments where localStorage is unavailable or cleared).
 */
import storage from "./storage";
import type { CharacterVoiceConfig } from "./characterVoices";
import { voiceConfigKey } from "./storageKeys";

const VOICE_CONFIG_VERSION = 1;

/** Whether `document.cookie` is available in the current environment. */
function canUseDocument(): boolean {
  try {
    return typeof document !== "undefined" && typeof document.cookie === "string";
  } catch {
    return false;
  }
}

/** Reads a single cookie value by name, or null if absent/unavailable. */
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

/** Writes a cookie, best-effort (silently no-ops on failure or when unavailable). */
function setCookie(name: string, value: string, days = 7) {
  if (!canUseDocument()) return;
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax`;
  } catch {
    // Ignore cookie write failures
  }
}

/** Base64-encodes a versioned payload for cookie storage. */
function encodePayload(payload: unknown): string | null {
  try {
    const json = JSON.stringify({ v: VOICE_CONFIG_VERSION, payload });
    return typeof btoa === "function" ? btoa(json) : json;
  } catch {
    return null;
  }
}

/** Decodes and validates a cookie-stored voice config payload, or null if invalid/absent. */
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

/** Loads a character's voice config, preferring localStorage and falling back to the cookie. */
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
    try {
      storage.setVersionedJSON(voiceConfigKey(botName), fromCookie, VOICE_CONFIG_VERSION);
    } catch {}
    return fromCookie;
  }
  return null;
}

/** Saves a character's voice config to both localStorage and the cookie fallback. */
export function persistVoiceConfig(botName: string, config: CharacterVoiceConfig) {
  if (!botName || !config) return;
  try {
    storage.setVersionedJSON(voiceConfigKey(botName), config, VOICE_CONFIG_VERSION);
  } catch {}
  const encoded = encodePayload(config);
  if (encoded) setCookie(voiceConfigKey(botName), encoded, 14);
}

/** Removes a character's voice config from both localStorage and the cookie fallback. */
export function clearVoiceConfig(botName: string) {
  if (!botName) return;
  try {
    storage.removeItem(voiceConfigKey(botName));
  } catch {}
  if (canUseDocument()) {
    try {
      document.cookie = `${voiceConfigKey(botName)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; samesite=lax`;
    } catch {}
  }
}
