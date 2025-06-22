// =============================
// api_getVoiceConfigForCharacter.ts
// Utility for fetching or generating a voice config for a character via API.
// Used by BotCreator and dynamic TTS logic.
// =============================

// API utility to fetch voice config for a character from the backend
export async function api_getVoiceConfigForCharacter(name: string, gender?: string | null): Promise<import("../../src/utils/characterVoices").CharacterVoiceConfig> {
  const res = await fetch("/api/get-voice-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(gender ? { name, gender } : { name }),
  });
  if (!res.ok) throw new Error("Failed to fetch voice config");
  return await res.json();
}
