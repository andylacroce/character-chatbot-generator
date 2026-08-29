/**
 * Google Text-to-Speech (TTS) utility for synthesizing audio from text.
 * Handles credential loading, TTS client instantiation, speech synthesis, and audio file cleanup.
 */

/**
 * Google Text-to-Speech (TTS) utility functions.
 *
 * Handles credential loading, TTS client instantiation, speech synthesis, and audio file cleanup.
 *
 * @module tts
 */

import textToSpeech, { protos } from "@google-cloud/text-to-speech";
import { GoogleAuth } from 'google-auth-library';
import fs from "fs";
import os from "os";
import path from "path";
import logger, { sanitizeLogMeta } from "./logger";
import sanitizeFilename from "sanitize-filename";

/**
 * Google Cloud service account credentials interface
 */
interface GoogleCredentials {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
}

/**
 * Retrieves Google Cloud authentication for TTS.
 * @returns {GoogleCredentials | unknown} The credentials object or override result.
 * @throws {Error} If credentials are missing or invalid.
 */
function getGoogleAuthCredentials(): GoogleCredentials | unknown {
  const overrideFn = (getGoogleAuthCredentials as unknown as { override?: (() => unknown) }).override;
  if (overrideFn) {
    return overrideFn();
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    throw new Error(
      "Missing GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable",
    );
  }
  let credentials: GoogleCredentials;
  if (process.env.VERCEL_ENV) {
    credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  } else {
    const credRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON as string;
    const credentialsPath = path.isAbsolute(credRaw)
      ? path.normalize(credRaw)
      : path.join(/*turbopackIgnore: true*/ process.cwd(), credRaw);
    credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  }
  
  return credentials;
}

/**
 * Build a google-auth-library GoogleAuth instance when explicit service account credentials are provided.
 * Returns undefined when no explicit credentials are provided so client libraries will use ADC.
 *
 * Note: we intentionally construct a GoogleAuth instance (not a raw JWT) so the
 * @google-cloud client receives a full auth object with the expected runtime
 * surface (methods such as getUniverseDomain). Passing a plain JWT-like object
 * or credentials blob directly can cause runtime errors in newer client versions.
 */
function getGoogleAuthClient(): GoogleAuth | undefined {
  try {
    const creds = getGoogleAuthCredentials();
    if (!creds || typeof creds !== 'object') return undefined;
    const c = creds as GoogleCredentials;
    if (!c.client_email || !c.private_key) return undefined;
    // Create GoogleAuth instance with explicit credentials to ensure the Google client
    // receives an auth object matching its expected API interface
    const auth = new GoogleAuth({
      credentials: c as Record<string, unknown>,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    return auth;
  } catch {
    // Credentials unavailable or invalid; fall back to Application Default Credentials
    return undefined;
  }
}

let ttsClient:
  | import("@google-cloud/text-to-speech").TextToSpeechClient
  | null = null;

/**
 * Returns a singleton instance of the Google Text-to-Speech client.
 * @returns {import("@google-cloud/text-to-speech").TextToSpeechClient}
 */
export function getTTSClient() {
  if (!ttsClient) {
    const authClient = getGoogleAuthClient();
    if (authClient) {
      // Pass GoogleAuth instance to provide required methods (e.g., getUniverseDomain)
      // that the @google-cloud client depends on
      ttsClient = new textToSpeech.TextToSpeechClient({ auth: authClient as never });
    } else {
      // Credentials not provided; client will use Application Default Credentials (ADC)
      logger.info('No explicit Google credentials found; falling back to Application Default Credentials (ADC)');
      ttsClient = new textToSpeech.TextToSpeechClient();
    }
  }
  return ttsClient;
}

/**
 * Google's synthesizeSpeech API rejects a request when a voice's `name` and
 * `ssmlGender` describe different voices, with a message like "Requested male
 * voice, but voice en-US-Neural2-C is a female voice." — the message itself
 * names the voice's real gender. This lets an already-persisted, pre-fix
 * voiceConfig (mismatched ssmlGender saved before the characterVoices.ts fix)
 * self-heal at synthesis time by retrying once with the corrected gender,
 * rather than failing every time it's used.
 * @returns {number | null} The corrected SsmlVoiceGender enum value, or null if
 *   the error doesn't match Google's gender-mismatch message format.
 */
function extractCorrectedSsmlGender(err: unknown): protos.google.cloud.texttospeech.v1.SsmlVoiceGender | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/requested \w+ voice, but voice \S+ is a (\w+) voice/i);
  if (!match) return null;
  const gender = match[1].toLowerCase();
  const { SsmlVoiceGender } = protos.google.cloud.texttospeech.v1;
  if (gender === 'male') return SsmlVoiceGender.MALE;
  if (gender === 'female') return SsmlVoiceGender.FEMALE;
  if (gender === 'neutral') return SsmlVoiceGender.NEUTRAL;
  return null;
}

/**
 * Synthesizes speech from text and writes the result to a file.
 * Retries up to 3 times on failure. Cleans up old audio files in the same directory.
 *
 * @param {object} params - The parameters for synthesis.
 * @param {string} params.text - The text or SSML to synthesize.
 * @param {string} params.filePath - The output file path for the audio.
 * @param {boolean} [params.ssml=false] - Whether the input is SSML.
 * @param {object} [params.voice] - Voice configuration for TTS.
 * @param {object} [params.audioConfig] - Audio configuration for TTS.
 * @returns {Promise<void>} Resolves when the file is written.
 * @throws {Error} If synthesis fails after retries.
 */
export async function synthesizeSpeechToFile({
  text,
  filePath,
  ssml = false,
  voice = {
    languageCodes: ["en-GB"],
    name: "en-GB-Wavenet-D",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE,
  },
  audioConfig = {
    audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
  },
}: {
  text: string;
  filePath: string;
  ssml?: boolean;
  voice?: protos.google.cloud.texttospeech.v1.IVoice;
  audioConfig?: protos.google.cloud.texttospeech.v1.IAudioConfig;
}): Promise<void> {
  const input = ssml ? { ssml: text } : { text };
  // Sanitize output path to prevent path traversal attacks.
  // Callers must supply an absolute path; path.normalize (not path.resolve) is used
  // so Turbopack's NFT tracer does not sweep process.cwd() into the bundle.
  if (!path.isAbsolute(filePath)) {
    throw new Error('filePath must be an absolute path');
  }
  const resolvedPath = path.normalize(filePath);
  const outDir = path.dirname(resolvedPath);
  const systemTmp = os.tmpdir();
  const isMp3 = resolvedPath.toLowerCase().endsWith('.mp3');
  if (!isMp3) {
    throw new Error('Output file must have .mp3 extension');
  }
  // Ensure output directory is within system temp directory boundaries
  if (!(outDir.startsWith(systemTmp + path.sep) || outDir === systemTmp)) {
    throw new Error('Invalid output directory: must reside under system temp');
  }
  // Prevent directory traversal by using only the filename component
  // Sanitize filename to remove unsafe characters
  const safeFile = path.join(outDir, sanitizeFilename(path.basename(resolvedPath)));
  // Note: Google TTS API expects 'languageCode' (singular), not 'languageCodes'
  const apiVoice = {
    ...voice,
    languageCode: (voice.languageCodes && voice.languageCodes[0]) || "en-GB",
  };
  delete apiVoice.languageCodes;
  if (apiVoice.name && apiVoice.ssmlGender === protos.google.cloud.texttospeech.v1.SsmlVoiceGender.NEUTRAL) {
    // Google's synthesizeSpeech API rejects ssmlGender: NEUTRAL outright
    // ("3 INVALID_ARGUMENT: Gender neutral voices are not supported.") whenever a
    // specific voice `name` is also given — discovered live via a character
    // (Nefertem) whose Claude-generated voiceConfig legitimately came back
    // "neutral". The name alone already identifies the voice unambiguously, so
    // ssmlGender is redundant in that case; drop it rather than fail every
    // request for any character with a neutral-gendered voiceConfig.
    delete apiVoice.ssmlGender;
  }
  const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input,
    voice: apiVoice,
    audioConfig,
  };
  const client = getTTSClient();

  // Retry synthesis with exponential backoff on transient failures. A gender
  // mismatch (voice `name` vs `ssmlGender` disagree) is not transient — it fails
  // identically every time — so it's corrected and retried separately, once,
  // without consuming the transient-failure attempt budget below.
  let lastError: unknown = null;
  let genderCorrected = false;
  let attempt = 1;
  const maxAttempts = 3;
  while (attempt <= maxAttempts) {
    try {
      const [response] = await client.synthesizeSpeech(request);
      if (!response || !response.audioContent) {
        throw new Error("TTS API response is missing audioContent");
      }
      fs.writeFileSync(safeFile, response.audioContent, "binary");
      logger.info("Audio file created", sanitizeLogMeta({
        event: "audio_create",
        filePath: safeFile
      }));
      return;
    } catch (err: unknown) {
      lastError = err;
      if (!genderCorrected) {
        const correctedGender = extractCorrectedSsmlGender(err);
        if (correctedGender !== null && request.voice && request.voice.ssmlGender !== correctedGender) {
          logger.warn("TTS gender mismatch detected; retrying with corrected ssmlGender", sanitizeLogMeta({
            event: "tts_gender_self_heal",
            voiceName: apiVoice.name,
            previousGender: request.voice.ssmlGender,
            correctedGender,
          }));
          request.voice.ssmlGender = correctedGender;
          genderCorrected = true;
          continue;
        }
      }
      attempt++;
      if (attempt <= maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  throw lastError;
}

/**
 * TEST-ONLY: Reset singletons and allow credential override for testing.
 * @param {(() => GoogleCredentials | unknown) | null} [overrideCredsFn] - Optional override function for credentials.
 */
export function __resetSingletonsForTest(overrideCredsFn?: (() => GoogleCredentials | unknown) | null) {
  ttsClient = null;
  const target = getGoogleAuthCredentials as unknown as { override?: (() => unknown) };
  if (overrideCredsFn) {
    target.override = overrideCredsFn;
  } else if (target.override) {
    delete target.override;
  }
}

export { getGoogleAuthCredentials };
