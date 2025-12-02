import logger, { sanitizeLogMeta } from "./logger";

/**
 * Character voice configuration using OpenAI structured output → Google TTS pipeline.
 * Minimal code - OpenAI provides exact values, we pass them directly to Google TTS.
 *
 * @module characterVoices
 */

/**
 * Interface for Google TTS voice configuration.
 */
export interface CharacterVoiceConfig {
  languageCodes: string[];
  name: string;
  ssmlGender: number;
  pitch?: number;
  rate?: number;
  type?: string;
}

/**
 * Google TTS gender enum.
 */
export const SSML_GENDER = {
  NEUTRAL: 0,
  MALE: 1,
  FEMALE: 2,
  UNSPECIFIED: 3,
};

/**
 * Default voice for fallback only.
 */
export const CHARACTER_VOICE_MAP: Record<string, CharacterVoiceConfig> = {
  'Default': {
    languageCodes: ['en-GB'],
    name: 'en-GB-Wavenet-D',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 0,
    rate: 1.0,
    type: 'Wavenet',
  },
};

function normalizeCharacterName(name: string): string {
  return name.trim().toLowerCase().replace(/ +/g, ' ').replace(/(^| )\w/g, c => c.toUpperCase());
}


/**
 * In-memory cache for voice configs (per process).
 */
const dynamicVoiceCache: Record<string, CharacterVoiceConfig> = {};

/**
 * Voice configuration from OpenAI (maps directly to Google TTS parameters).
 */
interface VoiceConfig {
  gender: 'male' | 'female' | 'neutral';
  languageCode: string; // e.g., 'en-GB', 'en-US', 'de-DE'
  voiceName: string; // e.g., 'en-GB-Wavenet-D', 'en-US-Studio-M'
  pitch: number; // -20 to +20 semitones
  rate: number; // 0.25 to 4.0 (1.0 = normal)
}

/**
 * Fetches complete voice configuration from OpenAI.
 * OpenAI returns exact Google TTS voice name, pitch, and rate - no mapping needed.
 */
async function fetchVoiceConfigFromOpenAI(name: string): Promise<VoiceConfig> {
  const OpenAI = (await import('openai')).default;
  const { getOpenAIModel } = await import('./openaiModelSelector');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  
  const systemPrompt = `You are a voice casting expert for Google Text-to-Speech.

Return ONLY valid JSON with this exact schema:
{
  "gender": "male" | "female" | "neutral",
  "languageCode": "<locale>",  // e.g., "en-GB", "en-US", "de-DE", "fr-FR", "ja-JP", etc.
  "voiceName": "<voice>",      // Full Google TTS voice name, e.g., "en-GB-Wavenet-D", "en-US-Studio-M"
  "pitch": <number>,            // -20 to +20 semitones (0 = normal, negative = deeper, positive = higher)
  "rate": <number>              // 0.25 to 4.0 (1.0 = normal speed)
}

Guidelines:
- gender: Character's presentation
- languageCode: Match character's cultural/linguistic background
- voiceName: Choose from Google TTS voices (Studio/Wavenet/Neural2/Standard): https://cloud.google.com/text-to-speech/docs/voices
  Examples: "en-GB-Wavenet-D", "en-US-Studio-M", "de-DE-Wavenet-B", "fr-FR-Wavenet-A", "ja-JP-Wavenet-B"
- pitch: Age/depth (-15 to -20 very deep, -8 to -12 deep, -3 to -5 slightly low, 0 normal, 3-6 higher, 8-15 high/youthful, 15-20 child)
- rate: Speaking style (0.7-0.85 slow/deliberate, 0.9-1.0 measured, 1.0 normal, 1.05-1.2 quick, 1.2-1.4 fast)`;

  const userPrompt = `Character: "${name}"
Provide Google TTS voice configuration as JSON. Consider canonical depiction, cultural context, age, personality.`;

  const completion = await openai.chat.completions.create({
    model: getOpenAIModel("text"),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 150,
    temperature: 0.3,
    response_format: { type: "json_object" }
  });

  const content = completion.choices[0]?.message?.content?.trim() || '{}';
  const config = JSON.parse(content) as VoiceConfig;
  
  // Validate and clamp values
  return {
    gender: config.gender || 'male',
    languageCode: config.languageCode || 'en-US',
    voiceName: config.voiceName || 'en-US-Wavenet-D',
    pitch: typeof config.pitch === 'number' ? Math.max(-20, Math.min(20, config.pitch)) : 0,
    rate: typeof config.rate === 'number' ? Math.max(0.25, Math.min(4.0, config.rate)) : 1.0,
  };
}

/**
 * Gets voice configuration for a character.
 * Uses OpenAI to get exact Google TTS parameters, then passes them directly.
 */
export async function getVoiceConfigForCharacter(
  name: string,
  genderOverride?: string | null
): Promise<CharacterVoiceConfig> {
  const normalized = normalizeCharacterName(name);
  const cacheKey = genderOverride ? `${normalized}_${genderOverride}` : normalized;
  
  // Check cache
  if (dynamicVoiceCache[cacheKey]) {
    return dynamicVoiceCache[cacheKey];
  }
  
  let config: CharacterVoiceConfig;
  
  try {
    // Get voice config from OpenAI
    const voiceConfig = await fetchVoiceConfigFromOpenAI(normalized);
    
    // Map gender string to SSML enum (apply override if provided)
    let ssmlGender = SSML_GENDER.MALE;
    const effectiveGender = genderOverride || voiceConfig.gender;
    if (effectiveGender === 'female') ssmlGender = SSML_GENDER.FEMALE;
    else if (effectiveGender === 'neutral') ssmlGender = SSML_GENDER.NEUTRAL;
    
    // Create config directly from OpenAI response
    config = {
      languageCodes: [voiceConfig.languageCode],
      name: voiceConfig.voiceName,
      ssmlGender,
      pitch: voiceConfig.pitch,
      rate: voiceConfig.rate,
      type: voiceConfig.voiceName.includes('Studio') ? 'Studio' :
            voiceConfig.voiceName.includes('Wavenet') ? 'Wavenet' :
            voiceConfig.voiceName.includes('Neural2') ? 'Neural2' : 'Standard',
    };
    
    logger.info("Voice config from OpenAI", sanitizeLogMeta({
      event: "tts_openai_voice",
      character: normalized,
      genderOverride: genderOverride || 'none',
      voice: config.name,
      pitch: config.pitch,
      rate: config.rate,
      type: config.type
    }));
  } catch (err) {
    // Fallback to Default
    logger.warn("Falling back to Default voice", sanitizeLogMeta({
      event: "tts_fallback_default",
      error: err instanceof Error ? err.message : String(err)
    }));
    
    config = CHARACTER_VOICE_MAP['Default'];
  }
  
  // Cache and return
  dynamicVoiceCache[cacheKey] = config;
  return config;
}
