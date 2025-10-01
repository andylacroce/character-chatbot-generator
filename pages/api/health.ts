// =============================
// pages/api/health.ts
// Next.js API route for health checks of OpenAI and Google TTS services.
// Returns status for monitoring and uptime checks.
// =============================

import OpenAI from "openai";
import textToSpeech, { protos } from "@google-cloud/text-to-speech";
import { GoogleAuth } from 'google-auth-library';
import fs from "fs";
import { generateRequestId, logEvent, sanitizeLogMeta } from "../../src/utils/logger";

/**
 * Next.js API route handler for health checks.
 * Checks OpenAI and Google TTS service health.
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(
  req: import("next").NextApiRequest,
  res: import("next").NextApiResponse,
) {
  const requestId = req.headers["x-request-id"] || generateRequestId();

  let openaiStatus = "ok";
  let openaiError = null;
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OpenAI API key");
    const openai = new OpenAI({ apiKey });
    const result = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0,
      response_format: { type: "text" },
    });
    if (!result || !result.choices || !result.choices[0]?.message?.content) {
      throw new Error("No valid OpenAI response");
    }
  } catch (err: unknown) {
    openaiStatus = "error";
    openaiError = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== "production") {
      logEvent("error", "health_openai_error", "OpenAI health check error", sanitizeLogMeta({
        requestId,
        error: err instanceof Error ? err.message : String(err)
      }));
    }
    logEvent("info", "health_openai_failed", "OpenAI health check failed", sanitizeLogMeta({
      requestId,
      error: openaiError
    }));
  }

  let ttsStatus = "ok";
  let ttsError = null;
  try {
    let creds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!creds) throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
    if (!creds.trim().startsWith("{")) {
      creds = fs.readFileSync(creds, "utf8");
    }
    const credentials = JSON.parse(creds);
  // Build a GoogleAuth instance when explicit credentials provided, otherwise let ADC take over
    let ttsClient: import('@google-cloud/text-to-speech').TextToSpeechClient;
    if (credentials && credentials.client_email && credentials.private_key) {
      // Build a GoogleAuth instance from the credentials so the client receives
      // a fully-featured auth object with the expected methods.
      const auth = new GoogleAuth({
        credentials: credentials as Record<string, unknown>,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      ttsClient = new textToSpeech.TextToSpeechClient({ auth });
    } else {
      // No explicit credentials found; fallback to ADC for the health check.
      logEvent("info", "health_tts_adc_fallback", "Falling back to Application Default Credentials (ADC) for TTS client", sanitizeLogMeta({ requestId }));
      ttsClient = new textToSpeech.TextToSpeechClient();
    }
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text: "ping" },
      voice: {
        languageCode: "en-GB",
        name: "en-GB-Wavenet-D",
        ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE,
      },
      audioConfig: {
        audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      },
    });
    if (!response || !response.audioContent) {
      throw new Error("No audio content from TTS");
    }
  } catch (err: unknown) {
    ttsStatus = "error";
    ttsError = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== "production") {
      logEvent("error", "health_tts_error", "Google TTS health check error", sanitizeLogMeta({
        requestId,
        error: err instanceof Error ? err.message : String(err)
      }));
    }
    logEvent("info", "health_tts_failed", "Google TTS health check failed", sanitizeLogMeta({
      requestId,
      error: ttsError
    }));
  }

  if (openaiStatus === "ok" && ttsStatus === "ok") {
    logEvent("info", "health_ok", "All services healthy", sanitizeLogMeta({
      requestId
    }));
    return res.status(200).json({ status: "ok", requestId });
  }
  if (process.env.NODE_ENV !== "production")
    logEvent("error", "health_service_error", "Service error", sanitizeLogMeta({
      requestId,
      openaiStatus,
      openaiError,
      ttsStatus,
      ttsError
    }));
  logEvent("info", "health_service_error_info", "Service error", sanitizeLogMeta({
    requestId,
    openaiStatus,
    ttsStatus
  }));
  return res.status(500).json({
    status: "error",
    openai: { status: openaiStatus, error: openaiError },
    tts: { status: ttsStatus, error: ttsError },
    requestId
  });
}
