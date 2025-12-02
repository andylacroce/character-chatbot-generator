// =============================
// tts.ts
// Google Text-to-Speech (TTS) utility functions for synthesizing audio from text.
// Handles credential loading, TTS client instantiation, speech synthesis, and audio file cleanup.
// =============================

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
    const credentialsPath = path.resolve(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    );
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
    // Create a GoogleAuth instance using the explicit credentials so the underlying
    // Google client receives an auth object with the expected API.
    const auth = new GoogleAuth({
      credentials: c as Record<string, unknown>,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    return auth;
  } catch {
    // If credentials aren't available or invalid, fall back to ADC by returning undefined
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
      // Pass the GoogleAuth instance directly; this provides the methods expected by
      // the @google-cloud client (avoids runtime errors such as getUniverseDomain missing).
      ttsClient = new textToSpeech.TextToSpeechClient({ auth: authClient });
    } else {
      // Let the client discover credentials via ADC and log this for debugging
      logger.info('No explicit Google credentials found; falling back to Application Default Credentials (ADC)');
      ttsClient = new textToSpeech.TextToSpeechClient();
    }
  }
  return ttsClient;
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
  // Sanitize and constrain output path
  const resolvedPath = path.resolve(filePath);
  const outDir = path.dirname(resolvedPath);
  const systemTmp = path.resolve('/tmp');
  const isMp3 = resolvedPath.toLowerCase().endsWith('.mp3');
  if (!isMp3) {
    throw new Error('Output file must have .mp3 extension');
  }
  // Ensure output directory is within system temp
  if (!(outDir.startsWith(systemTmp + path.sep) || outDir === systemTmp)) {
    throw new Error('Invalid output directory: must reside under system temp');
  }
  // Prevent directory traversal by rejoining basename
  // Additionally sanitize the filename component to remove unsafe characters
  const safeFile = path.join(outDir, sanitizeFilename(path.basename(resolvedPath)));
  // The API expects languageCode, not languageCodes
  const apiVoice = {
    ...voice,
    languageCode: (voice.languageCodes && voice.languageCodes[0]) || "en-GB",
  };
  delete apiVoice.languageCodes;
  const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input,
    voice: apiVoice,
    audioConfig,
  };
  const client = getTTSClient();

  // Retry logic for TTS
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
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
      // Clean up other .mp3 files in the same temp dir, with strict guards
      try {
        const tmpDirRaw = path.dirname(safeFile);
        const tmpDir = path.resolve(tmpDirRaw);
        const systemTmp = path.resolve('/tmp');
        // Only perform cleanup inside system temp to avoid unsafe deletions
        if (tmpDir.startsWith(systemTmp + path.sep) || tmpDir === systemTmp) {
          const newFile = path.basename(filePath);
          const files = fs.readdirSync(tmpDir);
          for (const file of files) {
            // Only target .mp3 files and skip the newly created one
            if (!file.toLowerCase().endsWith('.mp3') || file === newFile) continue;
            try {
              const candidate = path.resolve(path.join(tmpDir, file));
              // Ensure the resolved candidate remains within the tmpDir boundary
              if (!(candidate.startsWith(tmpDir + path.sep) || candidate === tmpDir)) continue;
              fs.unlinkSync(candidate);
              logger.info("Audio file deleted", sanitizeLogMeta({
                event: "audio_cleanup_deleted",
                file: candidate
              }));
            } catch (err) {
              logger.warn("Audio file delete failed", sanitizeLogMeta({
                event: "audio_cleanup_failed",
                file,
                error: err instanceof Error ? err.message : String(err)
              }));
            }
          }
        }
      } catch (err) {
        logger.warn("Audio cleanup error", sanitizeLogMeta({
          event: "audio_cleanup_error",
          error: err instanceof Error ? err.message : String(err)
        }));
      }
      return;
    } catch (err: unknown) {
      lastError = err;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  throw lastError;
}

/**
 * Deletes the given list of files if they are .mp3 files.
 * @param {string[]} files - Array of file paths.
 */
function cleanupTempFiles(files: string[]): void {
  const baseTmp = process.env.TTS_TMP_DIR || '/tmp/test-tts';
  const allowedDir = path.resolve(baseTmp);
  for (const file of files) {
    // Only allow deletion of .mp3 files inside the allowed temp directory
    const resolved = path.resolve(file);
    if (!file.toLowerCase().endsWith('.mp3')) continue;
    if (!(resolved.startsWith(allowedDir + path.sep) || resolved === allowedDir)) continue;
    try {
      fs.unlinkSync(resolved);
      logger.info("Audio file deleted", sanitizeLogMeta({
        event: "audio_cleanup_deleted",
        file: resolved
      }));
    } catch (err) {
      logger.warn("Audio file delete failed", sanitizeLogMeta({
        event: "audio_cleanup_failed",
        file: resolved,
        error: err instanceof Error ? err.message : String(err)
      }));
    }
  }
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

export { getGoogleAuthCredentials, cleanupTempFiles };
