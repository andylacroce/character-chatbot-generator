// Server-side runtime configuration shared by API handlers.
// Keep server-only values here; expose safe values to the client via an API route.
export const AVATAR_TIMEOUT_MS = 60_000; // 60 seconds

// Shared personality template constants
export const RESPONSE_CONSTRAINTS = `Keep responses under 100 words. Always finish your current thought with proper punctuation before stopping.
If telling a story, reach a natural pause point or cliffhanger. Never trail off mid-sentence.`;

export function generatePersonalityPrompt(characterName: string): string {
  return `You are ${characterName}. Stay in character and respond naturally. Use your internal knowledge. Never break character or mention being an AI.

${RESPONSE_CONSTRAINTS}`;
}
