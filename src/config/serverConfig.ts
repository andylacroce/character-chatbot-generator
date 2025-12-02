// Server-side runtime configuration shared by API handlers.
// Keep server-only values here; expose safe values to the client via an API route.
export const AVATAR_TIMEOUT_MS = 60_000; // 60 seconds

// Shared personality template constants
export const RESPONSE_CONSTRAINTS = `Keep responses under 100 words. Always finish your current thought with proper punctuation before stopping.
If telling a story, reach a natural pause point or cliffhanger. Never trail off mid-sentence.`;

/**
 * Generates a character-specific personality prompt using OpenAI.
 * Creates tailored system prompts with speaking style, personality traits, and behavioral guidelines.
 */
export async function generatePersonalityPrompt(characterName: string): Promise<string> {
  try {
    const OpenAI = (await import('openai')).default;
    const { getOpenAIModel } = await import('../utils/openaiModelSelector');
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    
    const systemPrompt = `You are a character personality expert. Create a detailed system prompt for roleplaying as the given character.

Return ONLY valid JSON with this schema:
{
  "speakingStyle": "<style>",     // e.g., "formal and articulate", "casual and enthusiastic", "terse and cryptic"
  "personalityTraits": "<traits>", // e.g., "confident, analytical, slightly arrogant"
  "knowledgeDomains": "<domains>", // e.g., "deduction, chemistry, Victorian London"
  "behavioralGuidelines": "<guidelines>", // e.g., "Show impatience with obvious observations. Reference past cases."
  "quirks": "<quirks>"            // e.g., "Often plays violin when thinking. Uses British idioms."
}

Guidelines:
- Based on canonical depiction if character is well-known
- Include specific behavioral patterns and speech patterns
- Note any catchphrases or linguistic quirks
- Identify key knowledge areas
- Describe how they interact with others`;

    const completion = await openai.chat.completions.create({
      model: getOpenAIModel("text"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Character: "${characterName}"\n\nProvide character personality configuration as JSON.` }
      ],
      max_tokens: 300,
      temperature: 0.4,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content?.trim() || '{}';
    const config = JSON.parse(content);

    // Build the system prompt from the structured data
    const prompt = `You are ${characterName}.

SPEAKING STYLE: ${config.speakingStyle || 'Natural and authentic to character'}
PERSONALITY: ${config.personalityTraits || 'Stay true to character'}
KNOWLEDGE: ${config.knowledgeDomains || 'Use your internal knowledge'}
BEHAVIOR: ${config.behavioralGuidelines || 'Respond naturally in character'}
QUIRKS: ${config.quirks || 'Express character-specific mannerisms'}

Stay in character at all times. Never break character or mention being an AI.

${RESPONSE_CONSTRAINTS}`;

    return prompt;
  } catch {
    // Fallback to simple template on error
    return `You are ${characterName}. Stay in character and respond naturally. Use your internal knowledge. Never break character or mention being an AI.\n\n${RESPONSE_CONSTRAINTS}`;
  }
}
