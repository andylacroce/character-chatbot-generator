import { SSML_GENDER, type AvailableGoogleVoice, type VoiceConfig } from "./voiceTypes";

/**
 * The live Google Text-to-Speech voice inventory: loaded once per warm process, filtered to
 * the classic voice families this app casts from, and formatted for Claude.
 */

const SUPPORTED_AUTOMATIC_VOICE_NAME =
  /-(?:Wavenet|Neural2|Studio|Standard|Journey|News|Polyglot)-/;

let voiceCatalogPromise: Promise<AvailableGoogleVoice[]> | null = null;

/** Maps Google's ListVoices enum string keys to this module's numeric SSML_GENDER. */
const GOOGLE_GENDER_NAME_TO_ENUM: Record<string, number> = {
  SSML_VOICE_GENDER_UNSPECIFIED: SSML_GENDER.UNSPECIFIED,
  MALE: SSML_GENDER.MALE,
  FEMALE: SSML_GENDER.FEMALE,
  NEUTRAL: SSML_GENDER.NEUTRAL,
};

/**
 * Google's client library reports a protobuf enum's own string key (e.g. "FEMALE"), not
 * its underlying integer, for `voice.ssmlGender` in a real `ListVoices` response — a
 * numeric mock previously hid this, so every live voice was silently read as
 * SSML_VOICE_GENDER_UNSPECIFIED, the whole catalog was filtered out, and every character
 * fell back to CHARACTER_VOICE_MAP["Default"]. Handles a numeric value too, since that's
 * still a valid shape for this same field elsewhere (e.g. a synthesis request).
 */
export function parseGoogleSsmlGender(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value in GOOGLE_GENDER_NAME_TO_ENUM) {
    return GOOGLE_GENDER_NAME_TO_ENUM[value];
  }
  return SSML_GENDER.UNSPECIFIED;
}

/** Converts Google's numeric gender metadata into the model-facing profile value. */
export function mapSsmlToGender(ssmlGender: number): VoiceConfig["gender"] {
  if (ssmlGender === SSML_GENDER.FEMALE) return "female";
  if (ssmlGender === SSML_GENDER.NEUTRAL) return "neutral";
  return "male";
}

/** Loads the exact classic Google voices available to this deployment. */
async function loadVoiceCatalog(): Promise<AvailableGoogleVoice[]> {
  const { getTTSClient } = await import("./tts");
  const [response] = await getTTSClient().listVoices({});
  const voices = (response.voices || [])
    .map((voice) => ({
      languageCodes: (voice.languageCodes || []).filter(
        (code): code is string => typeof code === "string" && Boolean(code),
      ),
      name: typeof voice.name === "string" ? voice.name : "",
      ssmlGender: parseGoogleSsmlGender(voice.ssmlGender),
    }))
    .filter(
      (voice) =>
        Boolean(voice.name) &&
        voice.languageCodes.length > 0 &&
        voice.ssmlGender !== SSML_GENDER.UNSPECIFIED &&
        SUPPORTED_AUTOMATIC_VOICE_NAME.test(voice.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (voices.length === 0) throw new Error("Google TTS returned no supported voices");
  return voices;
}

/**
 * Returns the cached catalog, fetching it once per warm process. A rejected promise is
 * cleared so a transient `listVoices` failure does not poison every later character
 * creation.
 */
export async function getAvailableGoogleVoices(): Promise<AvailableGoogleVoice[]> {
  if (!voiceCatalogPromise) {
    voiceCatalogPromise = loadVoiceCatalog().catch((err) => {
      voiceCatalogPromise = null;
      throw err;
    });
  }
  return voiceCatalogPromise;
}

/** TEST-ONLY: clears the cached voice catalog so each test observes its own mock. */
export function __resetVoiceCatalogForTest(): void {
  voiceCatalogPromise = null;
}

/** Formats Google's trusted inventory as a compact casting catalog for Claude. */
export function formatVoiceCatalog(voices: AvailableGoogleVoice[]): string {
  return voices
    .map(
      (voice) =>
        `${voice.name} | ${voice.languageCodes.join(",")} | ${mapSsmlToGender(voice.ssmlGender)}`,
    )
    .join("\n");
}

/**
 * Finds a selected voice in Google's live inventory. The returned metadata, rather than
 * Claude's recollection, is authoritative for language and gender. This replaces the old
 * validation synthesis of the word "test", which made a billable TTS request and turned
 * every guessed/mismatched name into a visible SynthesizeSpeech error.
 */
export function findAvailableVoice(
  voices: AvailableGoogleVoice[],
  voiceName: string,
): AvailableGoogleVoice | undefined {
  return voices.find((voice) => voice.name === voiceName);
}
