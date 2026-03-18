/**
 * Health check endpoint for Claude (Anthropic) and Google TTS.
 * Returns service status for monitoring/uptime probes.
 */

import Anthropic from "@anthropic-ai/sdk";
import textToSpeech, { protos } from "@google-cloud/text-to-speech";
import { GoogleAuth } from 'google-auth-library';
import fs from "fs";
import { generateRequestId, logEvent, sanitizeLogMeta } from "../../src/utils/logger";

/**
 * Next.js API route handler for health checks.
 * Checks Claude and Google TTS service health.
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(
  req: import("next").NextApiRequest,
  res: import("next").NextApiResponse,
) {
  const requestId = req.headers["x-request-id"] || generateRequestId();

  let claudeStatus = "ok";
  let claudeError = null;
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing Anthropic API key");
    const anthropic = new Anthropic({ apiKey });
    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      system: "You are a health check bot.",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    if (!result || !result.content || !result.content[0]) {
      throw new Error("No valid Claude response");
    }
  } catch (err: unknown) {
    claudeStatus = "error";
    claudeError = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== "production") {
      logEvent("error", "health_claude_error", "Claude health check error", sanitizeLogMeta({
        requestId,
        error: err instanceof Error ? err.message : String(err)
      }));
    }
    logEvent("info", "health_claude_failed", "Claude health check failed", sanitizeLogMeta({
      requestId,
      error: claudeError
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
    // Build GoogleAuth when explicit credentials exist; otherwise allow ADC discovery.
    let ttsClient: import('@google-cloud/text-to-speech').TextToSpeechClient;
    if (credentials && credentials.client_email && credentials.private_key) {
      const auth = new GoogleAuth({
        credentials: credentials as Record<string, unknown>,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      ttsClient = new textToSpeech.TextToSpeechClient({ auth });
    } else {
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

  if (claudeStatus === "ok" && ttsStatus === "ok") {
    logEvent("info", "health_ok", "All services healthy", sanitizeLogMeta({
      requestId
    }));
    return res.status(200).json({ status: "ok", requestId });
  }
  if (process.env.NODE_ENV !== "production")
    logEvent("error", "health_service_error", "Service error", sanitizeLogMeta({
      requestId,
      claudeStatus,
      claudeError,
      ttsStatus,
      ttsError
    }));
  logEvent("info", "health_service_error_info", "Service error", sanitizeLogMeta({
    requestId,
    claudeStatus,
    ttsStatus
  }));
  return res.status(500).json({
    status: "error",
    claude: { status: claudeStatus, error: claudeError },
    tts: { status: ttsStatus, error: ttsError },
    requestId
  });
}
