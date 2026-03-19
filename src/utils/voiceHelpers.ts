/**
 * Shared voice utilities used by the chat and audio API routes.
 * Centralises Studio voice normalisation and SSML generation so the logic
 * lives in one place.
 */

import type { CharacterVoiceConfig } from "./characterVoices";

const VALID_STUDIO_VOICES = ["en-US-Studio-M", "en-US-Studio-O"] as const;

const FALLBACK_STUDIO_VOICE: CharacterVoiceConfig = {
  languageCodes: ["en-US"],
  name: "en-US-Studio-M",
  ssmlGender: 1,
  type: "Studio",
};

/**
 * Returns true when the voice config refers to a Google Studio voice.
 * Checks both the `type` field and the voice name as a fallback for configs
 * that were created before the `type` field was added.
 */
function isStudioVoice(voiceConfig: CharacterVoiceConfig): boolean {
  return (
    voiceConfig.type === "Studio" ||
    (!!voiceConfig.name && voiceConfig.name.includes("Studio"))
  );
}

/**
 * Ensures a Studio voice config uses a valid Studio voice name.
 * Non-Studio configs are returned unchanged.
 * Invalid Studio voice names are replaced with the default fallback.
 */
export function normalizeStudioVoice(
  voiceConfig: CharacterVoiceConfig,
): CharacterVoiceConfig {
  if (!isStudioVoice(voiceConfig)) return voiceConfig;
  if (VALID_STUDIO_VOICES.includes(voiceConfig.name as typeof VALID_STUDIO_VOICES[number])) {
    return voiceConfig;
  }
  return FALLBACK_STUDIO_VOICE;
}

/**
 * Builds an SSML string for Google TTS.
 * Studio voices use plain `<speak>` wrappers; all other voices apply
 * `<prosody>` pitch and rate attributes.
 */
export function buildSsml(
  text: string,
  voiceConfig: CharacterVoiceConfig,
): string {
  if (isStudioVoice(voiceConfig)) {
    return `<speak>${text}</speak>`;
  }
  const pitch =
    typeof voiceConfig.pitch === "number" ? voiceConfig.pitch : -13;
  const rate =
    typeof voiceConfig.rate === "number"
      ? `${Math.round(voiceConfig.rate * 100)}%`
      : "80%";
  return `<speak><prosody pitch="${pitch}st" rate="${rate}"> ${text} </prosody></speak>`;
}
