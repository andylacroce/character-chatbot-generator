// API utility to fetch voice config for a character from the backend
export async function api_getVoiceConfigForCharacter(name: string) {
  const res = await fetch("/api/get-voice-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to fetch voice config");
  return await res.json();
}
