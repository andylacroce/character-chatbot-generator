import "openai/shims/node";
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import textToSpeech, { protos } from "@google-cloud/text-to-speech";
import fs from "fs";
import logger from "../../src/utils/logger";

/**
 * Next.js API route handler for health checks.
 * Checks OpenAI and Google TTS service health.
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
function isInternalRequest(req: import("next").NextApiRequest): boolean {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const clientSecret = req.headers["x-internal-api-secret"];
  // Allow all requests in development (localhost) for easier local testing
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return Boolean(internalSecret) && clientSecret === internalSecret;
}

export default async function handler(
  req: import("next").NextApiRequest,
  res: import("next").NextApiResponse,
) {
  if (!isInternalRequest(req)) {
    logger.warn(`[Health API] 401 Unauthorized: Attempted access from non-internal source`);
    return res.status(401).json({ error: "Unauthorized" });
  }

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
  } catch (err: any) {
    openaiStatus = "error";
    openaiError = err.message || String(err);
    if (process.env.NODE_ENV !== "production") {
      logger.error("[HealthCheck] OpenAI error:", err);
    }
    logger.info(`[HealthCheck] 500 OpenAI error: ${openaiError}`);
  }

  let ttsStatus = "ok";
  let ttsError = null;
  try {
    let creds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!creds) throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
    if (!creds.trim().startsWith("{")) {
      creds = fs.readFileSync(creds, "utf8");
    }
    const ttsClient = new textToSpeech.TextToSpeechClient({
      credentials: JSON.parse(creds),
    });
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
  } catch (err: any) {
    ttsStatus = "error";
    ttsError = err.message || String(err);
    if (process.env.NODE_ENV !== "production") {
      logger.error("[HealthCheck] Google TTS error:", err);
    }
    logger.info(`[HealthCheck] 500 Google TTS error: ${ttsError}`);
  }

  if (openaiStatus === "ok" && ttsStatus === "ok") {
    if (process.env.NODE_ENV !== "production")
      logger.info("[HealthCheck] All services healthy");
    logger.info(`[HealthCheck] 200 OK: All services healthy`);
    return res.status(200).json({ status: "ok" });
  }
  if (process.env.NODE_ENV !== "production")
    logger.error("[HealthCheck] Service error", {
      openaiStatus,
      openaiError,
      ttsStatus,
      ttsError,
    });
  logger.info(`[HealthCheck] 500 Service error: openaiStatus=${openaiStatus}, ttsStatus=${ttsStatus}`);
  return res.status(500).json({
    status: "error",
    openai: { status: openaiStatus, error: openaiError },
    tts: { status: ttsStatus, error: ttsError },
  });
}
