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
import fs from "fs";
import path from "path";
import logger from "./logger";

/**
 * Retrieves Google Cloud authentication credentials for TTS.
 * @returns {object} The credentials object.
 * @throws {Error} If credentials are missing or invalid.
 */
function getGoogleAuthCredentials() {
  const overrideFn = (getGoogleAuthCredentials as unknown as { override?: (() => unknown) }).override;
  if (overrideFn) {
    return overrideFn();
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    throw new Error(
      "Missing GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable",
    );
  }
  if (process.env.VERCEL_ENV) {
    return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  } else {
    const credentialsPath = path.resolve(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    );
    return JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  }
}

let ttsClient:
  | import("@google-cloud/text-to-speech").TextToSpeechClient
  | null = null;

/**
 * Returns a singleton instance of the Google Text-to-Speech client.
 * @returns {import("@google-cloud/text-to-speech").TextToSpeechClient}
 */
function getTTSClient() {
  if (!ttsClient) {
    ttsClient = new textToSpeech.TextToSpeechClient({
      credentials: getGoogleAuthCredentials(),
    });
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
      fs.writeFileSync(filePath, response.audioContent, "binary");
      logger.info(`[AUDIO CREATE] Created audio file: ${filePath}`);
      // Clean up all other .mp3 files in /tmp except the one just created
      try {
        const tmpDir = path.dirname(filePath);
        const newFile = path.basename(filePath);
        const files = fs.readdirSync(tmpDir);
        for (const file of files) {
          if (file.endsWith('.mp3') && file !== newFile) {
            try {
              fs.unlinkSync(path.join(tmpDir, file));
              logger.info(`[AUDIO CLEANUP] Deleted old audio file: ${file}`);
            } catch (err) {
              logger.warn(`[AUDIO CLEANUP] Failed to delete file: ${file}`, err);
            }
          }
        }
      } catch (err) {
        logger.warn('[AUDIO CLEANUP] Error during cleanup:', err);
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
 * Wrapper for TTS synthesis with input validation, as expected by tests.
 * @param {string} text - The text to synthesize.
 * @param {string} lang - The language code (e.g., 'en').
 * @returns {Promise<string>} The path to the generated audio file.
 */
async function tts(text: string, lang: string): Promise<string> {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Invalid or empty text input');
  }
  if (!lang || typeof lang !== 'string') {
    throw new Error('Invalid language code');
  }
  // Generate a temp file path
  const tmpDir = path.resolve(process.env.TTS_TMP_DIR || '/tmp/test-tts');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const fileName = `test-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  const filePath = path.join(tmpDir, fileName);
  await synthesizeSpeechToFile({ text, filePath, voice: { languageCodes: [lang] } });
  return filePath;
}

/**
 * Deletes the given list of files if they are .mp3 files.
 * @param {string[]} files - Array of file paths.
 */
function cleanupTempFiles(files: string[]): void {
  for (const file of files) {
    if (file.endsWith('.mp3')) {
      try {
        fs.unlinkSync(file);
        logger.info(`[AUDIO CLEANUP] Deleted old audio file: ${file}`);
      } catch (err) {
        logger.warn(`[AUDIO CLEANUP] Failed to delete file: ${file}`, err);
      }
    }
  }
}

/**
 * TEST-ONLY: Reset singletons and allow credential override for testing.
 * @param {(() => unknown) | null} [overrideCredsFn] - Optional override function for credentials.
 */
export function __resetSingletonsForTest(overrideCredsFn?: (() => unknown) | null) {
  ttsClient = null;
  const target = getGoogleAuthCredentials as unknown as { override?: (() => unknown) };
  if (overrideCredsFn) {
    target.override = overrideCredsFn;
  } else if (target.override) {
    delete target.override;
  }
}

export { getGoogleAuthCredentials, getTTSClient, tts, cleanupTempFiles };
