// Mapping from character/bot name to Google TTS voice settings
// Extend this as needed for more characters
export interface CharacterVoiceConfig {
  languageCodes: string[];
  name: string;
  ssmlGender: number; // protos.google.cloud.texttospeech.v1.SsmlVoiceGender
  pitch?: number;
  rate?: number;
}

// Google TTS gender enum for reference
export const SSML_GENDER = {
  NEUTRAL: 0,
  MALE: 1,
  FEMALE: 2,
  UNSPECIFIED: 3,
};

export const CHARACTER_VOICE_MAP: Record<string, CharacterVoiceConfig> = {
  'Gandalf': {
    languageCodes: ['en-GB'],
    name: 'en-GB-Wavenet-D',
    ssmlGender: SSML_GENDER.MALE,
    pitch: -13,
    rate: 0.8,
  },
  'Einstein': {
    languageCodes: ['de-DE'],
    name: 'de-DE-Wavenet-B',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 0,
    rate: 1.0,
  },
  'Yoda': {
    languageCodes: ['en-US'],
    name: 'en-US-Wavenet-B',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 5,
    rate: 0.85,
  },
  'Shakespeare': {
    languageCodes: ['en-GB'],
    name: 'en-GB-Wavenet-B',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 0,
    rate: 1.0,
  },
  // Add more as needed
};

export function getVoiceConfigForCharacter(name: string): CharacterVoiceConfig {
  // Try exact match, then fallback to Gandalf
  return CHARACTER_VOICE_MAP[name] || CHARACTER_VOICE_MAP['Gandalf'];
}
