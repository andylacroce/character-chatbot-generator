import type { CharacterVoiceConfig } from "./types";

interface ReplayAudioOptions {
  audioFileUrl?: string;
  text: string;
  botName: string;
  gender?: string | null;
  voiceConfig?: CharacterVoiceConfig | null;
}

/** Produces a compact deterministic filename for lazily regenerated replay audio. */
function hashReplayAudio(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Recovers the CharacterVoiceConfig already baked into a `/api/audio` URL's `voiceConfig`
 * query param, or null if the URL has none or fails to parse. `/api/audio?...` URLs
 * produced by chat.ts/ttsReply.ts always embed the exact config actually used to
 * synthesize that line.
 */
export function extractVoiceConfigFromAudioUrl(
  audioFileUrl: string | undefined,
): CharacterVoiceConfig | null {
  if (!audioFileUrl) return null;
  try {
    const queryString = audioFileUrl.split("?")[1] ?? "";
    const raw = new URLSearchParams(queryString).get("voiceConfig");
    if (!raw) return null;
    return JSON.parse(raw) as CharacterVoiceConfig;
  } catch {
    return null;
  }
}

/**
 * Finds the exact voice config already used for `sender` elsewhere in this transcript, by
 * reading it back out of another message's own audio URL. Used when replaying a message
 * that itself has no `audioFileUrl` (e.g. TTS failed for that one turn): without this, the
 * replay would fall through to an on-demand `/api/audio` URL carrying no `voiceConfig` at
 * all, which forces the server into a fresh, context-free, non-deterministic re-cast that
 * can silently hand the speaker a different — even differently-gendered — voice than the
 * one they've been using all along.
 */
export function findSpeakerVoiceConfig<M extends { sender: string; audioFileUrl?: string }>(
  messages: M[],
  sender: string,
): CharacterVoiceConfig | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.sender !== sender) continue;
    const config = extractVoiceConfigFromAudioUrl(message.audioFileUrl);
    if (config) return config;
  }
  return null;
}

/** Returns a message's existing audio URL or an on-demand TTS URL when none was persisted. */
export function getReplayAudioUrl({
  audioFileUrl,
  text,
  botName,
  gender,
  voiceConfig,
}: ReplayAudioOptions): string {
  if (audioFileUrl) return audioFileUrl;

  const serializedVoiceConfig = voiceConfig ? JSON.stringify(voiceConfig) : "";
  const cacheIdentity = `${botName}\u0000${text}\u0000${gender ?? ""}\u0000${serializedVoiceConfig}`;
  // Built from one object rather than .set(): some React Native URLSearchParams
  // polyfills only implement the constructor and toString().
  const params = new URLSearchParams({
    file: `replay-${hashReplayAudio(cacheIdentity)}.mp3`,
    text,
    botName,
    ...(gender ? { gender } : {}),
    ...(serializedVoiceConfig ? { voiceConfig: serializedVoiceConfig } : {}),
  });

  return `/api/audio?${params.toString()}`;
}
