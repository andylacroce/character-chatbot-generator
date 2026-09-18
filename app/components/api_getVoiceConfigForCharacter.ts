// =============================
// api_getVoiceConfigForCharacter.ts
// Utility for fetching or generating a voice config for a character via API.
// Used by BotCreator and dynamic TTS logic.
// =============================

import { authenticatedFetch } from "../../src/utils/api";

/** Fetches (or triggers generation of) a character's voice config from the backend. */
export async function api_getVoiceConfigForCharacter(
  name: string,
  voiceGender?: string | null,
): Promise<import("../../src/utils/characterVoices").CharacterVoiceConfig> {
  const res = await authenticatedFetch("/api/get-voice-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(voiceGender ? { name, voiceGender } : { name }),
  });
  if (!res.ok) throw new Error("Failed to fetch voice config");
  return await res.json();
}
