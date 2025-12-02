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
 * Validates a voice name by attempting to use it with Google TTS.
 * Returns true if valid, false if invalid.
 */
async function isValidGoogleTTSVoice(voiceName: string, languageCode: string): Promise<boolean> {
  try {
    const { getTTSClient } = await import('./tts');
    
    const client = getTTSClient();
    
    // Try to synthesize a very short test phrase
    const [response] = await client.synthesizeSpeech({
      input: { text: 'test' },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'MP3' as const,
      },
    });
    
    // If we got audio content back, the voice is valid
    return !!response.audioContent;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Voice doesn't exist or other error
    logger.info("Voice validation failed", sanitizeLogMeta({
      voiceName,
      error: errMsg.substring(0, 100)
    }));
    return false;
  }
}

/**
 * Fetches complete voice configuration from OpenAI with retry logic.
 * If OpenAI returns an invalid voice name, it will retry with error feedback.
 */
async function fetchVoiceConfigFromOpenAI(name: string, maxRetries = 3): Promise<VoiceConfig> {
  const OpenAI = (await import('openai')).default;
  const { getOpenAIModel } = await import('./openaiModelSelector');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  
  const systemPrompt = `You are a voice casting expert for Google Text-to-Speech.

Return ONLY valid JSON with this exact schema:
{
  "gender": "male" | "female" | "neutral",
  "languageCode": "<locale>",  // e.g., "en-GB", "en-US", "de-DE", "fr-FR", "ja-JP"
  "voiceName": "<voice>",      // Full Google TTS voice name, e.g., "en-GB-Wavenet-D"
  "pitch": <number>,            // -20 to +20 semitones (0 = normal)
  "rate": <number>              // 0.25 to 4.0 (1.0 = normal speed)
}

Voice naming pattern: <locale>-<type>-<letter>
Types: Wavenet, Neural2, Studio (US only), Standard
Examples: en-US-Wavenet-D, en-GB-Wavenet-A, de-DE-Wavenet-B, ja-JP-Wavenet-C

CRITICAL: You MUST provide a valid Google TTS voice name. If you receive error feedback about an invalid voice, try a different variant.`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Character: "${name}"\nProvide Google TTS voice configuration as JSON.` }
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: getOpenAIModel("text"),
        messages,
        max_tokens: 150,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content?.trim() || '{}';
      const config = JSON.parse(content) as VoiceConfig;
      
      // Basic validation
      const voiceNamePattern = /^[a-z]{2}-[A-Z]{2}-(Wavenet|Neural2|Studio|Standard|Journey|News|Polyglot)-[A-Z]$/;
      if (!config.voiceName || !voiceNamePattern.test(config.voiceName)) {
        if (attempt < maxRetries) {
          logger.warn(`Voice name format invalid on attempt ${attempt}, retrying`, sanitizeLogMeta({
            attempt,
            providedVoice: config.voiceName
          }));
          messages.push(
            { role: "assistant", content },
            { role: "user", content: `ERROR: Voice name "${config.voiceName}" is malformed. Use format: <locale>-<type>-<letter> (e.g., en-US-Wavenet-D). Try again with a valid voice.` }
          );
          continue;
        }
        throw new Error(`Invalid voice name format after ${maxRetries} attempts`);
      }

      // Validate with actual Google TTS API
      const isValid = await isValidGoogleTTSVoice(config.voiceName, config.languageCode || 'en-US');
      
      if (!isValid) {
        if (attempt < maxRetries) {
          logger.warn(`Voice validation failed on attempt ${attempt}, asking OpenAI to try another`, sanitizeLogMeta({
            attempt,
            voiceName: config.voiceName,
            languageCode: config.languageCode
          }));
          messages.push(
            { role: "assistant", content },
            { role: "user", content: `ERROR: Voice "${config.voiceName}" does not exist in Google TTS. Try a different voice variant (different letter: A, B, C, D, etc.) or type (Wavenet, Neural2, Standard).` }
          );
          continue;
        }
        throw new Error(`No valid voice found after ${maxRetries} attempts`);
      }

      // Success! Voice is valid
      logger.info("Valid voice configuration from OpenAI", sanitizeLogMeta({
        attempt,
        voiceName: config.voiceName,
        languageCode: config.languageCode
      }));

      return {
        gender: config.gender || 'male',
        languageCode: config.languageCode || 'en-US',
        voiceName: config.voiceName,
        pitch: typeof config.pitch === 'number' ? Math.max(-20, Math.min(20, config.pitch)) : 0,
        rate: typeof config.rate === 'number' ? Math.max(0.25, Math.min(4.0, config.rate)) : 1.0,
      };

    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }
      logger.warn(`Attempt ${attempt} failed, retrying`, sanitizeLogMeta({
        error: err instanceof Error ? err.message : String(err)
      }));
    }
  }

  throw new Error('Failed to get valid voice config from OpenAI');
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
