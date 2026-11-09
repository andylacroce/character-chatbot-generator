/**
 * Shared voice types and constants, kept in their own module so the voice catalog and the
 * casting logic can both import them without a cycle.
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
 * Voice configuration from Claude (maps directly to Google TTS parameters).
 */
export interface VoiceConfig {
  gender: "male" | "female" | "neutral";
  languageCode: string; // Language code (e.g., 'en-GB', 'en-US', 'de-DE')
  voiceName: string; // Google TTS voice name (e.g., 'en-GB-Wavenet-D')
  pitch: number; // Pitch adjustment in semitones (-20 to +20)
  rate: number; // Speech rate multiplier (0.25 to 4.0, where 1.0 is normal)
}

export interface AvailableGoogleVoice {
  languageCodes: string[];
  name: string;
  ssmlGender: number;
}
