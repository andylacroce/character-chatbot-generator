/**
 * Shared voice utilities used by the chat and audio API routes.
 * Centralises SSML generation so the logic lives in one place.
 */

import type { CharacterVoiceConfig } from "./characterVoices";

/**
 * Returns true when the voice config refers to a Google Studio voice.
 * Checks both the `type` field and the voice name as a fallback for configs
 * that were created before the `type` field was added.
 */
function isStudioVoice(voiceConfig: CharacterVoiceConfig): boolean {
  return (
    voiceConfig.type === "Studio" || (!!voiceConfig.name && voiceConfig.name.includes("Studio"))
  );
}

/**
 * Escapes the five reserved XML characters so arbitrary text can be safely embedded in an
 * SSML document. Without this, ordinary dialogue containing `&`/`<` already produces
 * malformed SSML, and (since `text` here can be attacker-influenced — see buildSsml) an
 * unescaped `<` would let a caller inject arbitrary SSML tags for Google's TTS engine to
 * parse rather than just spoken text.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds an SSML string for Google TTS.
 * Studio voices use plain `<speak>` wrappers; all other voices apply
 * `<prosody>` pitch and rate attributes. `text` is XML-escaped before interpolation.
 */
export function buildSsml(text: string, voiceConfig: CharacterVoiceConfig): string {
  const safeText = escapeXml(text);
  if (isStudioVoice(voiceConfig)) {
    return `<speak>${safeText}</speak>`;
  }
  const pitch = typeof voiceConfig.pitch === "number" ? voiceConfig.pitch : -13;
  const rate =
    typeof voiceConfig.rate === "number" ? `${Math.round(voiceConfig.rate * 100)}%` : "80%";
  return `<speak><prosody pitch="${pitch}st" rate="${rate}"> ${safeText} </prosody></speak>`;
}
