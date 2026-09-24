// =============================
// api_getVoiceConfigForCharacter.ts
// Utility for fetching or generating a voice config for a character via API.
// Used by BotCreator and dynamic TTS logic.
// =============================

import { authenticatedFetch } from "../../utils/api";

/** Fetches (or triggers generation of) a character's voice config from the backend. */
export async function api_getVoiceConfigForCharacter(
  name: string,
  gender?: string | null,
  voiceContext?: string,
): Promise<import("../../utils/characterVoices").CharacterVoiceConfig> {
  const body: { name: string; gender?: string; voiceContext?: string } = { name };
  if (gender) body.gender = gender;
  if (voiceContext?.trim()) body.voiceContext = voiceContext;
  const res = await authenticatedFetch("/api/get-voice-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to fetch voice config");
  return await res.json();
}
