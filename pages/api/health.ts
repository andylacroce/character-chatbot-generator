import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import textToSpeech, { protos } from "@google-cloud/text-to-speech";
import fs from "fs";
import logger, { generateRequestId } from "../../src/utils/logger";

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
  } catch (err: any) {
    openaiStatus = "error";
    openaiError = err.message || String(err);
    if (process.env.NODE_ENV !== "production") {
      logger.error(`[HealthCheck] OpenAI error | requestId=${requestId}:`, err);
    }
    logger.info(`[HealthCheck] 500 OpenAI error: ${openaiError} | requestId=${requestId}`);
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
      logger.error(`[HealthCheck] Google TTS error | requestId=${requestId}:`, err);
    }
    logger.info(`[HealthCheck] 500 Google TTS error: ${ttsError} | requestId=${requestId}`);
  }

  if (openaiStatus === "ok" && ttsStatus === "ok") {
    logger.info(`[HealthCheck] 200 OK: All services healthy | requestId=${requestId}`);
    return res.status(200).json({ status: "ok", requestId });
  }
  if (process.env.NODE_ENV !== "production")
    logger.error(`[HealthCheck] Service error | requestId=${requestId}`, {
      openaiStatus,
      openaiError,
      ttsStatus,
      ttsError,
    });
  logger.info(`[HealthCheck] 500 Service error: openaiStatus=${openaiStatus}, ttsStatus=${ttsStatus} | requestId=${requestId}`);
  return res.status(500).json({
    status: "error",
    openai: { status: openaiStatus, error: openaiError },
    tts: { status: ttsStatus, error: ttsError },
    requestId
  });
}
