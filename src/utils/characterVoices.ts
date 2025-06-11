/**
 * Mapping from character/bot name to Google TTS voice settings.
 *
 * Provides static voice configurations for well-known characters and a default.
 *
 * @module characterVoices
 */

/**
 * Interface for Google TTS voice configuration for a character.
 * @property {string[]} languageCodes - Supported language codes.
 * @property {string} name - Google TTS voice name.
 * @property {number} ssmlGender - SSML gender enum value.
 * @property {number} [pitch] - Optional pitch adjustment.
 * @property {number} [rate] - Optional speaking rate.
 * @property {string} [type] - Voice type (e.g., 'Wavenet', 'Studio').
 */
export interface CharacterVoiceConfig {
  languageCodes: string[];
  name: string;
  ssmlGender: number; // protos.google.cloud.texttospeech.v1.SsmlVoiceGender
  pitch?: number;
  rate?: number;
  type?: string; // Add type for robust Studio detection
}

/**
 * Google TTS gender enum for reference.
 * @enum {number}
 */
export const SSML_GENDER = {
  NEUTRAL: 0,
  MALE: 1,
  FEMALE: 2,
  UNSPECIFIED: 3,
};

export const CHARACTER_VOICE_MAP: Record<string, CharacterVoiceConfig> = {
  'Default': {
    languageCodes: ['en-GB'],
    name: 'en-GB-Wavenet-D',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 0,
    rate: 1.0,
    type: 'Wavenet', // Add type to all static configs
  },
  'Einstein': {
    languageCodes: ['de-DE'],
    name: 'de-DE-Wavenet-B',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 0,
    rate: 1.0,
    type: 'Wavenet',
  },
  'Yoda': {
    languageCodes: ['en-US'],
    name: 'en-US-Wavenet-B',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 5,
    rate: 0.85,
    type: 'Wavenet',
  },
  'Shakespeare': {
    languageCodes: ['en-GB'],
    name: 'en-GB-Wavenet-B',
    ssmlGender: SSML_GENDER.MALE,
    pitch: 0,
    rate: 1.0,
    type: 'Wavenet',
  },
  // Add more as needed
};

function normalizeCharacterName(name: string): string {
  return name.trim().replace(/ +/g, ' ').replace(/(^| )\w/g, c => c.toUpperCase());
}

/**
 * =============================
 * GOOGLE_TTS_VOICES
 * -----------------------------
 * List of available Google TTS voices, including Wavenet, Studio, Neural2, and Standard types.
 * Each entry includes language, name, gender, display label, and type for matching.
 *
 * - Use this list to match dynamic or static character voice requests.
 * - If adding new voices, ensure the 'type' and 'display' fields are descriptive.
 * - For dynamic matching, see findClosestTTSVoice().
 * =============================
 */
// List of available Google TTS voices (expanded with more variants)
const GOOGLE_TTS_VOICES = [
  // Wavenet voices
  { languageCodes: ['en-GB'], name: 'en-GB-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'British Male', type: 'Wavenet' },
  { languageCodes: ['en-GB'], name: 'en-GB-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'British Male 2', type: 'Wavenet' },
  { languageCodes: ['en-GB'], name: 'en-GB-Wavenet-F', ssmlGender: SSML_GENDER.FEMALE, display: 'British Female', type: 'Wavenet' },
  { languageCodes: ['en-US'], name: 'en-US-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'American Male', type: 'Wavenet' },
  { languageCodes: ['en-US'], name: 'en-US-Wavenet-F', ssmlGender: SSML_GENDER.FEMALE, display: 'American Female', type: 'Wavenet' },
  { languageCodes: ['en-US'], name: 'en-US-Wavenet-C', ssmlGender: SSML_GENDER.MALE, display: 'American Male 2', type: 'Wavenet' },
  { languageCodes: ['en-US'], name: 'en-US-Wavenet-E', ssmlGender: SSML_GENDER.FEMALE, display: 'American Female 2', type: 'Wavenet' },
  // Studio voices
  { languageCodes: ['en-US'], name: 'en-US-Studio-M', ssmlGender: SSML_GENDER.MALE, display: 'American Male (Studio)', type: 'Studio' },
  { languageCodes: ['en-US'], name: 'en-US-Studio-O', ssmlGender: SSML_GENDER.MALE, display: 'American Male 2 (Studio)', type: 'Studio' },
  // Neural2 voices
  { languageCodes: ['en-US'], name: 'en-US-Neural2-M', ssmlGender: SSML_GENDER.MALE, display: 'American Male (Neural2)', type: 'Neural2' },
  { languageCodes: ['en-US'], name: 'en-US-Neural2-F', ssmlGender: SSML_GENDER.FEMALE, display: 'American Female (Neural2)', type: 'Neural2' },
  // Regional/age/gender variants
  { languageCodes: ['en-AU'], name: 'en-AU-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'Australian Male', type: 'Wavenet' },
  { languageCodes: ['en-AU'], name: 'en-AU-Wavenet-F', ssmlGender: SSML_GENDER.FEMALE, display: 'Australian Female', type: 'Wavenet' },
  { languageCodes: ['en-IN'], name: 'en-IN-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'Indian Male', type: 'Wavenet' },
  { languageCodes: ['en-IN'], name: 'en-IN-Wavenet-F', ssmlGender: SSML_GENDER.FEMALE, display: 'Indian Female', type: 'Wavenet' },
  {
    languageCodes: ['de-DE'], name: 'de-DE-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'German Male', type: 'Wavenet'
  },
  {
    languageCodes: ['fr-FR'], name: 'fr-FR-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'French Female', type: 'Wavenet',
  },
  {
    languageCodes: ['fr-FR'], name: 'fr-FR-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'French Male', type: 'Wavenet',
  },
  {
    languageCodes: ['es-ES'], name: 'es-ES-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Spanish Female', type: 'Wavenet',
  },
  {
    languageCodes: ['es-ES'], name: 'es-ES-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'Spanish Male', type: 'Wavenet',
  },
  {
    languageCodes: ['it-IT'], name: 'it-IT-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Italian Female', type: 'Wavenet',
  },
  {
    languageCodes: ['it-IT'], name: 'it-IT-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'Italian Male', type: 'Wavenet',
  },
  {
    languageCodes: ['pt-PT'], name: 'pt-PT-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'Portuguese Male', type: 'Wavenet',
  },
  {
    languageCodes: ['pt-BR'], name: 'pt-BR-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Brazilian Portuguese Female', type: 'Wavenet',
  },
  {
    languageCodes: ['pt-BR'], name: 'pt-BR-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'Brazilian Portuguese Male', type: 'Wavenet',
  },
  {
    languageCodes: ['nl-NL'], name: 'nl-NL-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Dutch Female', type: 'Wavenet',
  },
  {
    languageCodes: ['nl-NL'], name: 'nl-NL-Wavenet-D', ssmlGender: SSML_GENDER.MALE, display: 'Dutch Male', type: 'Wavenet',
  },
  {
    languageCodes: ['ru-RU'], name: 'ru-RU-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'Russian Male', type: 'Wavenet',
  },
  {
    languageCodes: ['ru-RU'], name: 'ru-RU-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Russian Female', type: 'Wavenet',
  },
  {
    languageCodes: ['ja-JP'], name: 'ja-JP-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'Japanese Male', type: 'Wavenet',
  },
  {
    languageCodes: ['ja-JP'], name: 'ja-JP-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Japanese Female', type: 'Wavenet',
  },
  {
    languageCodes: ['ko-KR'], name: 'ko-KR-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'Korean Male', type: 'Wavenet',
  },
  {
    languageCodes: ['ko-KR'], name: 'ko-KR-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Korean Female', type: 'Wavenet',
  },
  {
    languageCodes: ['zh-CN'], name: 'zh-CN-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'Mandarin Male', type: 'Wavenet',
  },
  {
    languageCodes: ['zh-CN'], name: 'zh-CN-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Mandarin Female', type: 'Wavenet',
  },
  {
    languageCodes: ['zh-TW'], name: 'zh-TW-Wavenet-B', ssmlGender: SSML_GENDER.MALE, display: 'Cantonese Male', type: 'Wavenet',
  },
  {
    languageCodes: ['zh-TW'], name: 'zh-TW-Wavenet-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Cantonese Female', type: 'Wavenet',
  },
  {
    languageCodes: ['en-GB'], name: 'en-GB-Standard-D', ssmlGender: SSML_GENDER.MALE, display: 'British Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['en-GB'], name: 'en-GB-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'British Male 2 (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['en-GB'], name: 'en-GB-Standard-F', ssmlGender: SSML_GENDER.FEMALE, display: 'British Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['en-US'], name: 'en-US-Standard-D', ssmlGender: SSML_GENDER.MALE, display: 'American Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['en-US'], name: 'en-US-Standard-F', ssmlGender: SSML_GENDER.FEMALE, display: 'American Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['de-DE'], name: 'de-DE-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'German Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['fr-FR'], name: 'fr-FR-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'French Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['fr-FR'], name: 'fr-FR-Standard-D', ssmlGender: SSML_GENDER.MALE, display: 'French Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['es-ES'], name: 'es-ES-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Spanish Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['es-ES'], name: 'es-ES-Standard-D', ssmlGender: SSML_GENDER.MALE, display: 'Spanish Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['it-IT'], name: 'it-IT-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Italian Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['it-IT'], name: 'it-IT-Standard-D', ssmlGender: SSML_GENDER.MALE, display: 'Italian Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['pt-PT'], name: 'pt-PT-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'Portuguese Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['pt-BR'], name: 'pt-BR-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Brazilian Portuguese Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['pt-BR'], name: 'pt-BR-Standard-D', ssmlGender: SSML_GENDER.MALE, display: 'Brazilian Portuguese Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['nl-NL'], name: 'nl-NL-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Dutch Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['nl-NL'], name: 'nl-NL-Standard-D', ssmlGender: SSML_GENDER.MALE, display: 'Dutch Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['ru-RU'], name: 'ru-RU-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'Russian Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['ru-RU'], name: 'ru-RU-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Russian Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['ja-JP'], name: 'ja-JP-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'Japanese Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['ja-JP'], name: 'ja-JP-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Japanese Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['ko-KR'], name: 'ko-KR-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'Korean Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['ko-KR'], name: 'ko-KR-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Korean Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['zh-CN'], name: 'zh-CN-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'Mandarin Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['zh-CN'], name: 'zh-CN-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Mandarin Female (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['zh-TW'], name: 'zh-TW-Standard-B', ssmlGender: SSML_GENDER.MALE, display: 'Cantonese Male (Standard)', type: 'Standard',
  },
  {
    languageCodes: ['zh-TW'], name: 'zh-TW-Standard-A', ssmlGender: SSML_GENDER.FEMALE, display: 'Cantonese Female (Standard)', type: 'Standard',
  },
  // ...add more as needed...
];

/**
 * =============================
 * DYNAMIC VOICE MATCHING LOGIC
 * -----------------------------
 * - fetchVoiceDescriptionFromOpenAI: Uses OpenAI to generate a natural language description of a character's likely voice.
 * - findClosestTTSVoice: Heuristically matches a description to the best available TTS voice, considering language, gender, style, and quality.
 * - getVoiceConfigForCharacter: Main entry point; returns static config if available, otherwise uses dynamic detection and caches the result.
 *
 * All dynamic results are cached in-memory for the process lifetime.
 * =============================
 */

/**
 * @typedef {Object} GOOGLE_TTS_VOICE_ENTRY
 * @property {string[]} languageCodes - Supported language codes.
 * @property {string} name - Google TTS voice name.
 * @property {number} ssmlGender - SSML gender enum value.
 * @property {string} display - Human-readable label for UI.
 * @property {string} type - Voice type (e.g., 'Wavenet', 'Studio', 'Neural2', 'Standard').
 */

/**
 * In-memory cache for dynamic voice selection (per process).
 * Keyed by normalized character name.
 */
const dynamicVoiceCache: Record<string, CharacterVoiceConfig> = {};

/**
 * Fetches a description of the character's likely voice from OpenAI.
 * Uses GPT-4o to generate a short, detailed description for TTS matching.
 *
 * Example output: "A deep, gravelly British male voice, mid-60s, slow and wise."
 *
 * @param {string} name - The name of the character.
 * @returns {Promise<string>} - A promise that resolves to the voice description.
 */
async function fetchVoiceDescriptionFromOpenAI(name: string): Promise<string> {
  // Use OpenAI to describe the character's likely voice
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const prompt = `Describe the speaking voice of ${name} in 1-2 sentences, including accent, tone, pitch, speed, age, and any unique vocal traits.`;
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    max_tokens: 120,
    temperature: 0.2,
  });
  return completion.choices[0]?.message?.content?.trim() || '';
}

/**
 * Finds the closest matching TTS voice configuration based on a description.
 * Uses heuristics for language, gender, style, and quality.
 *
 * @param {string} description - The voice description.
 * @returns {CharacterVoiceConfig} - The closest matching voice configuration.
 */
function findClosestTTSVoice(description: string): CharacterVoiceConfig {
  // Enhanced matching: parse for accent, language, gender, style, tone, expressive, regional, age, and prefer higher-quality voices
  const desc = description.toLowerCase();

  // Language/accent/region detection
  let lang = 'en-GB';
  if (desc.match(/german|deutsch|germany/)) lang = 'de-DE';
  else if (desc.match(/american|us|usa|california|new york|midwest/)) lang = 'en-US';
  else if (desc.match(/british|england|uk|london|scottish/)) lang = 'en-GB';
  else if (desc.match(/australian|aussie|australia/)) lang = 'en-AU';
  else if (desc.match(/indian|india/)) lang = 'en-IN';
  else if (desc.match(/french|france|paris/)) lang = 'fr-FR';
  else if (desc.match(/spanish|espanol|spain/)) lang = 'es-ES';
  else if (desc.match(/italian|italy/)) lang = 'it-IT';
  else if (desc.match(/portuguese|portugal/)) lang = 'pt-PT';
  else if (desc.match(/brazil|brazilian/)) lang = 'pt-BR';
  else if (desc.match(/dutch|netherlands/)) lang = 'nl-NL';
  else if (desc.match(/russian|russia/)) lang = 'ru-RU';
  else if (desc.match(/japanese|japan/)) lang = 'ja-JP';
  else if (desc.match(/korean|korea/)) lang = 'ko-KR';
  else if (desc.match(/mandarin|chinese|china/)) lang = 'zh-CN';
  else if (desc.match(/cantonese|taiwan/)) lang = 'zh-TW';

  // Gender detection
  let gender = SSML_GENDER.MALE;
  if (desc.match(/female|woman|girl|lady/)) gender = SSML_GENDER.FEMALE;
  if (desc.match(/neutral|child|kid|boy|girl/)) gender = SSML_GENDER.NEUTRAL;

  // Style/tone/age/characteristic/expressive detection
  const styleHints = [
    { key: 'old', match: /old|elderly|aged|wise/, pitch: -4 },
    { key: 'deep', match: /deep|bass|low/, pitch: -6 },
    { key: 'child', match: /child|kid|boy|girl/, pitch: 6, gender: SSML_GENDER.NEUTRAL },
    { key: 'young', match: /young|teen|youth/, pitch: 3 },
    { key: 'high', match: /high|soprano/, pitch: 6 },
    { key: 'robot', match: /robot|synthetic|android/, type: 'Standard' },
    { key: 'news', match: /news|anchor|reporter/, type: 'Wavenet' },
    { key: 'narrator', match: /narrator|storyteller/, type: 'Wavenet' },
    { key: 'casual', match: /casual|friendly|conversational/, type: 'Wavenet' },
    { key: 'studio', match: /studio|premium|realistic/, type: 'Studio' },
    { key: 'chirp', match: /chirp|hd|ultra|expressive|emotional|dynamic/, type: 'Chirp' },
    { key: 'neural2', match: /neural2|natural|expressive|neural/, type: 'Neural2' },
    { key: 'expressive', match: /expressive|emotional|dynamic/, type: 'Chirp' },
    { key: 'regional', match: /australian|indian|scottish|irish|canadian/, type: 'Wavenet' },
    { key: 'studio', match: /studio|premium/, type: 'Studio' },
  ];

  let pitch = 0;
  let preferredType: string | undefined = undefined;
  for (const hint of styleHints) {
    if (desc.match(hint.match)) {
      if (typeof hint.pitch === 'number') pitch = hint.pitch;
      if (hint.gender !== undefined) gender = hint.gender;
      if (hint.type) preferredType = hint.type;
    }
  }

  // Prefer higher-quality voices: Chirp > Studio > Neural2 > Wavenet > Standard
  const typePreference = preferredType
    ? [preferredType, 'Chirp', 'Studio', 'Neural2', 'Wavenet', 'Standard']
    : ['Chirp', 'Studio', 'Neural2', 'Wavenet', 'Standard'];

  // Try to find the best match by type, language, and gender
  let match = undefined;
  for (const type of typePreference) {
    match = GOOGLE_TTS_VOICES.find(v => v.languageCodes[0] === lang && v.ssmlGender === gender && v.type === type);
    if (match) break;
  }
  if (!match) {
    for (const type of typePreference) {
      match = GOOGLE_TTS_VOICES.find(v => v.languageCodes[0] === lang && v.type === type);
      if (match) break;
    }
  }
  if (!match) {
    match = GOOGLE_TTS_VOICES.find(v => v.languageCodes[0] === lang && v.ssmlGender === gender);
  }
  if (!match) {
    match = GOOGLE_TTS_VOICES.find(v => v.languageCodes[0] === lang);
  }
  if (!match) {
    match = GOOGLE_TTS_VOICES[0];
  }
  return {
    languageCodes: match.languageCodes,
    name: match.name,
    ssmlGender: match.ssmlGender,
    pitch,
    rate: 1.0,
  };
}

/**
 * Gets the voice configuration for a character, either from static map or dynamic detection.
 * Returns a config with all required fields for Google TTS.
 *
 * @param {string} name - The name of the character.
 * @returns {Promise<CharacterVoiceConfig>} - A promise that resolves to the voice configuration.
 */
export async function getVoiceConfigForCharacter(name: string): Promise<CharacterVoiceConfig> {
  // Normalize name for lookup (capitalize each word, trim)
  const normalized = normalizeCharacterName(name);
  if (CHARACTER_VOICE_MAP[normalized]) {
    // Ensure type is present by matching to GOOGLE_TTS_VOICES
    const staticCfg = CHARACTER_VOICE_MAP[normalized];
    const match = GOOGLE_TTS_VOICES.find(v => v.name === staticCfg.name);
    return match ? { ...staticCfg, type: match.type } : staticCfg;
  }
  if (dynamicVoiceCache[normalized]) {
    const cached = dynamicVoiceCache[normalized];
    const match = GOOGLE_TTS_VOICES.find(v => v.name === cached.name);
    return match ? { ...cached, type: match.type } : cached;
  }
  // Dynamically determine voice using OpenAI
  let description = '';
  try {
    description = await fetchVoiceDescriptionFromOpenAI(normalized);
  } catch {
    // fallback to Default if OpenAI fails
    return CHARACTER_VOICE_MAP['Default'];
  }
  const config = findClosestTTSVoice(description);
  dynamicVoiceCache[normalized] = config;
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[TTS] Dynamic voice: requested='${name}', normalized='${normalized}', desc='${description}', using='${config.name}'`);
  }
  // Ensure type is present
  const match = GOOGLE_TTS_VOICES.find(v => v.name === config.name);
  return match ? { ...config, type: match.type } : config;
}
