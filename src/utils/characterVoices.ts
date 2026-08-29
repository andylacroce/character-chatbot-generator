import logger, { sanitizeLogMeta } from "./logger";
import { extractJson } from "./parseClaudeJson";

/**
 * Character voice configuration using Claude structured output → Google TTS pipeline.
 * Minimal code - Claude provides exact values, we pass them directly to Google TTS.
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
 * Google TTS gender enum. Values must match
 * @google-cloud/text-to-speech's actual SsmlVoiceGender proto enum
 * (SSML_VOICE_GENDER_UNSPECIFIED=0, MALE=1, FEMALE=2, NEUTRAL=3) — this object
 * previously had NEUTRAL and UNSPECIFIED transposed (0 and 3 swapped), so any
 * "neutral"-gender character silently sent UNSPECIFIED to Google instead.
 */
export const SSML_GENDER = {
  UNSPECIFIED: 0,
  MALE: 1,
  FEMALE: 2,
  NEUTRAL: 3,
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
 * Voice configuration from Claude (maps directly to Google TTS parameters).
 */
export interface VoiceConfig {
  gender: 'male' | 'female' | 'neutral';
  languageCode: string; // Language code (e.g., 'en-GB', 'en-US', 'de-DE')
  voiceName: string; // Google TTS voice name (e.g., 'en-GB-Wavenet-D')
  pitch: number; // Pitch adjustment in semitones (-20 to +20)
  rate: number; // Speech rate multiplier (0.25 to 4.0, where 1.0 is normal)
}

/**
 * Validates a voice name by attempting to use it with Google TTS.
 * Returns true if valid, false if invalid.
 */
async function isValidGoogleTTSVoice(voiceName: string, languageCode: string): Promise<boolean> {
  try {
    const { getTTSClient } = await import('./tts');

    const client = getTTSClient();

    // Attempt test synthesis to validate voice is available and functional
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

    // Audio content returned; voice is valid and usable
    return !!response.audioContent;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Voice not found or synthesis failed
    logger.info("Voice validation failed", sanitizeLogMeta({
      voiceName,
      error: errMsg.substring(0, 100)
    }));
    return false;
  }
}

/**
 * Fetches complete voice configuration from Claude with retry logic.
 * If Claude returns an invalid voice name, it will retry with error feedback.
 */
export async function fetchVoiceConfigFromClaude(name: string, maxRetries = 3, genderHint?: string | null): Promise<VoiceConfig> {
  const { getClaudeModel } = await import('./claudeModelSelector');
  const { default: anthropic } = await import('./anthropicClient');

  const systemPrompt = `You are a voice casting expert for Google Text-to-Speech.

Return ONLY valid JSON with this exact schema:
{
  "gender": "male" | "female" | "neutral",
  "languageCode": "<locale>",  // BCP-47 locale code (e.g., 'en-GB', 'en-US', 'de-DE', 'fr-FR', 'ja-JP')
  "voiceName": "<voice>",      // Full Google TTS voice name (e.g., 'en-GB-Wavenet-D')
  "pitch": <number>,            // Pitch adjustment (-20 to +20 semitones; 0 = normal)
  "rate": <number>              // Speech rate multiplier (0.25 to 4.0; 1.0 = normal)
}

Voice naming pattern: <locale>-<type>-<letter>
Types: Wavenet, Neural2, Studio (US only), Standard
Examples: en-US-Wavenet-D, en-GB-Wavenet-A, de-DE-Wavenet-B, ja-JP-Wavenet-C

CRITICAL: You MUST provide a valid Google TTS voice name. If you receive error feedback about an invalid voice, try a different variant.
CRITICAL: The "gender" field you return MUST match the actual gender of the specific "voiceName" you pick — Google TTS rejects a request when they disagree, so never return a voice name and a gender label that describe different voices.`;

  const genderHintText = genderHint
    ? ` This character's gender is understood to be "${genderHint}" — pick a voiceName whose actual Google TTS gender matches, and set the "gender" field to match that same voice (not necessarily "${genderHint}" verbatim, if no well-known voice fits).`
    : '';

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: "user", content: `Character: "${name}"\nProvide Google TTS voice configuration as JSON.${genderHintText}` }
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: getClaudeModel("text-simple"),
        system: systemPrompt,
        messages,
        max_tokens: 150,
        temperature: 0.3,
      });

      const content = extractJson(response.content[0]?.type === "text" ? response.content[0].text : '{}');
      const config = JSON.parse(content) as VoiceConfig;

      // Perform basic schema validation before API call
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

      // Validate using actual Google TTS API (true validation)
      const isValid = await isValidGoogleTTSVoice(config.voiceName, config.languageCode || 'en-US');

      if (!isValid) {
        if (attempt < maxRetries) {
          logger.warn(`Voice validation failed on attempt ${attempt}, asking Claude to try another`, sanitizeLogMeta({
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

      // Voice validation succeeded; configuration is ready
      logger.info("Valid voice configuration from Claude", sanitizeLogMeta({
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

  throw new Error('Failed to get valid voice config from Claude');
}

// Exported helper to normalize Claude voice configs for unit testing
export function normalizeClaudeConfig(config: Partial<VoiceConfig>) {
  return {
    gender: config.gender || 'male',
    languageCode: config.languageCode || 'en-US',
    voiceName: config.voiceName || '',
    pitch: typeof config.pitch === 'number' ? Math.max(-20, Math.min(20, config.pitch)) : 0,
    rate: typeof config.rate === 'number' ? Math.max(0.25, Math.min(4.0, config.rate)) : 1.0,
  };
}

/**
 * Gets voice configuration for a character:
 * Uses Claude to get exact Google TTS parameters, then passes them directly.
 */
export async function getVoiceConfigForCharacter(
  name: string,
  genderOverride?: string | null
): Promise<CharacterVoiceConfig> {
  const normalized = normalizeCharacterName(name);
  const cacheKey = genderOverride ? `${normalized}_${genderOverride}` : normalized;

  // Check if voice config is already cached
  if (dynamicVoiceCache[cacheKey]) {
    return dynamicVoiceCache[cacheKey];
  }

  let config: CharacterVoiceConfig;

  try {
    // Fetch voice configuration from Claude API. genderOverride is passed through as a
    // hint to the SAME call that picks voiceName, rather than applied afterward — a
    // voice name and its ssmlGender must describe the same voice or Google TTS rejects
    // the request outright, so ssmlGender always has to come from whatever gender
    // Claude reports for the voice it actually picked, never from an independently
    // guessed override applied after the fact (that's how a mismatch like "male"
    // ssmlGender paired with an actually-female-only voice name used to happen).
    const voiceConfig = await fetchVoiceConfigFromClaude(normalized, undefined, genderOverride);
    const ssmlGender = mapGenderToSsml(voiceConfig.gender);

    // Create voice configuration directly from Claude response
    config = {
      languageCodes: [voiceConfig.languageCode],
      name: voiceConfig.voiceName,
      ssmlGender,
      pitch: voiceConfig.pitch,
      rate: voiceConfig.rate,
      type: detectVoiceType(voiceConfig.voiceName),
    };

    logger.info("Voice config from Claude", sanitizeLogMeta({
      event: "tts_claude_voice",
      character: normalized,
      genderOverride: genderOverride || 'none',
      voice: config.name,
      pitch: config.pitch,
      rate: config.rate,
      type: config.type
    }));
  } catch (err) {
    // Use Default voice on error or cache miss
    logger.warn("Falling back to Default voice", sanitizeLogMeta({
      event: "tts_fallback_default",
      error: err instanceof Error ? err.message : String(err)
    }));

    config = CHARACTER_VOICE_MAP['Default'];
  }

  // Cache the configuration and return
  dynamicVoiceCache[cacheKey] = config;
  return config;
}

export function mapGenderToSsml(effectiveGender?: string | null) {
  if (effectiveGender === 'female') return SSML_GENDER.FEMALE;
  if (effectiveGender === 'neutral') return SSML_GENDER.NEUTRAL;
  return SSML_GENDER.MALE;
}

export function detectVoiceType(voiceName: string) {
  if (voiceName.includes('Studio')) return 'Studio';
  if (voiceName.includes('Wavenet')) return 'Wavenet';
  if (voiceName.includes('Neural2')) return 'Neural2';
  return 'Standard';
}
