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
