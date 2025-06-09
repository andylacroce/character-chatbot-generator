import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { synthesizeSpeechToFile } from "../../src/utils/tts";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import ipinfo from "ipinfo";
import logger from "../../src/utils/logger";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { setReplyCache } from "../../src/utils/cache";
import { getVoiceConfigForCharacter } from "../../src/utils/characterVoices";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  throw new Error(
    "Missing GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable",
  );
}

let googleAuthCredentials;

/**
 * Retrieves Google Cloud credentials for TTS and other APIs.
 * @returns {object} The parsed credentials object.
 * @throws {Error} If credentials are missing or invalid.
 */
function getGoogleCredentials() {
  let creds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!creds) throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (!creds.trim().startsWith("{")) {
    creds = fs.readFileSync(creds, "utf8");
  }
  return JSON.parse(creds);
}
googleAuthCredentials = getGoogleCredentials();

let conversationHistory: string[] = [];

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("Missing OpenAI API key");
}
const openai = new OpenAI({ apiKey });

/**
 * Checks if the given object is a valid OpenAI chat completion response.
 * @param {any} obj - The object to check.
 * @returns {boolean} True if the object is a valid response.
 */
function isOpenAIResponse(
  obj: any,
): obj is { choices: { message: { content: string } }[] } {
  return (
    obj &&
    typeof obj === "object" &&
    "choices" in obj &&
    Array.isArray(obj.choices)
  );
}

/**
 * Builds the OpenAI chat message array from conversation history and user input.
 * @param {string[]} history - The conversation history (excluding the latest user message).
 * @param {string} userMessage - The latest user message.
 * @returns {ChatCompletionMessageParam[]} The formatted message array for OpenAI API.
 */
function buildOpenAIMessages(
  history: string[],
  userMessage: string,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are Gandalf the Grey, wizard of Middle-earth. Speak with wisdom, warmth, and a touch of playful forgetfulness. Never reference the modern world. Use poetic, old-world language, and occasionally tease or offer roundabout advice as Gandalf would. Stay in character at all times. Respond in no more than 50 words. Do not start every response with the same word or phrase. Vary your sentence openings and avoid overusing 'Ah,' or similar interjections.`,
    },
  ];
  for (const entry of history) {
    if (entry.startsWith("User: ")) {
      messages.push({ role: "user", content: entry.replace(/^User: /, "") });
    } else if (entry.startsWith("Gandalf: ")) {
      messages.push({
        role: "assistant",
        content: entry.replace(/^Gandalf: /, ""),
      });
    }
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}

/**
 * Next.js API route handler for chat requests.
 * Handles user input, calls OpenAI, and returns Gandalf's reply and audio.
 * - Accepts POST requests with a 'message' in the body.
 * - Calls OpenAI API with chat history and system prompt.
 * - Generates a Gandalf-style reply and synthesizes audio using Google TTS.
 * - Returns the reply and a URL to the generated audio file.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 * @throws {Error} On missing input, OpenAI/TTS errors, or internal failures.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    logger.info(`[Chat API] 405 Method Not Allowed for ${req.method}`);
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const userMessage = req.body.message;
    const personality = req.body.personality || `You are Gandalf the Grey, wizard of Middle-earth. Speak with wisdom, warmth, and a touch of playful forgetfulness. Never reference the modern world. Use poetic, old-world language, and occasionally tease or offer roundabout advice as Gandalf would. Stay in character at all times. Respond in no more than 50 words. Do not start every response with the same word or phrase. Vary your sentence openings and avoid overusing 'Ah,' or similar interjections.`;
    const botName = req.body.botName || "Gandalf";
    if (!userMessage) {
      logger.info(`[Chat API] 400 Bad Request: Message is required`);
      return res.status(400).json({ error: "Message is required" });
    }

    // Get user IP for logging/location
    const userIp = Array.isArray(req.headers["x-forwarded-for"])
      ? req.headers["x-forwarded-for"][0]
      : req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    let userLocation = "Unknown location";
    if (userIp) {
      try {
        const locationData = await ipinfo(userIp as string);
        userLocation = `${locationData.city}, ${locationData.region}, ${locationData.country}`;
      } catch (error) {
        logger.error("IP info error:", error);
      }
    }

    const timestamp = new Date().toISOString();
    conversationHistory.push(`User: ${userMessage}`);
    if (conversationHistory.length > 50) {
      conversationHistory = conversationHistory.slice(-50);
    }
    // Build messages array with correct types
    const oldMessages = buildOpenAIMessages(conversationHistory.slice(0, -1), userMessage).slice(1); // skip old system prompt
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: personality } as ChatCompletionMessageParam,
      ...oldMessages
    ];

    // Timeout to avoid hanging
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 20000),
    );
    const result = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 200,
        temperature: 0.8,
        response_format: { type: "text" },
      }),
      timeout,
    ]);
    if (result && typeof result === "object" && "timeout" in result) {
      logger.info(`[Chat API] 408 Request Timeout`);
      return res.status(408).json({ reply: "Request timed out." });
    }
    if (!isOpenAIResponse(result)) {
      logger.info(
        `[Chat API] 500 Internal Server Error: Invalid OpenAI response`,
      );
      throw new Error("Invalid response from OpenAI");
    }
    const gandalfReply = result.choices[0]?.message?.content?.trim() ?? "";
    if (!gandalfReply || gandalfReply.trim() === "") {
      logger.info(
        `[Chat API] 500 Internal Server Error: Empty Gandalf response`,
      );
      throw new Error("Generated Gandalf response is empty.");
    }
    conversationHistory.push(`Gandalf: ${gandalfReply}`);

    // Prepare TTS request (voice tuned for character)
    const voiceConfig = req.body.voiceConfig || (await import("../../src/utils/characterVoices")).CHARACTER_VOICE_MAP["Gandalf"];
    logger.info(`[TTS] Using voice for botName='${botName}': ${JSON.stringify(voiceConfig)}`);
    const pitch = typeof voiceConfig.pitch === 'number' ? voiceConfig.pitch : -13;
    const rate = typeof voiceConfig.rate === 'number' ? Math.round(voiceConfig.rate * 100) + '%' : '80%';
    const ssmlText = `<speak><prosody pitch="${pitch}st" rate="${rate}"> ${gandalfReply} </prosody></speak>`;
    const tmpDir = "/tmp";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const audioFileName = `${uuidv4()}.mp3`;
    const audioFilePath = path.join(tmpDir, audioFileName);
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }
    try {
      await synthesizeSpeechToFile({
        text: ssmlText,
        filePath: audioFilePath,
        ssml: true,
        voice: voiceConfig,
      });
      // Write a .txt sidecar for audio regeneration
      const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
      fs.writeFileSync(txtFilePath, gandalfReply, "utf8");
      setReplyCache(audioFileName, gandalfReply);
    } catch (error) {
      logger.error("Text-to-Speech API error:", error);
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      return res
        .status(500)
        .json({ error: "Google Cloud TTS failed", details: errorMessage });
    }
    // --- Ensure .txt file is always written and matches reply ---
    try {
      const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
      if (
        !fs.existsSync(txtFilePath) ||
        fs.readFileSync(txtFilePath, "utf8").trim() !== gandalfReply.trim()
      ) {
        fs.writeFileSync(txtFilePath, gandalfReply, "utf8");
      }
    } catch (err) {
      logger.error("Failed to ensure .txt file for audio reply:", err);
    }

    logger.info(
      `${timestamp}|${userIp}|${userLocation}|${userMessage.replace(/"/g, '""')}|${gandalfReply.replace(/"/g, '""')}`,
    );
    logger.info(`[Chat API] 200 OK: Reply and audioFileUrl sent`);
    // Return audioFileUrl with text param for stateless regeneration
    const audioFileUrl = `/api/audio?file=${audioFileName}&text=${encodeURIComponent(gandalfReply)}&botName=${encodeURIComponent(botName)}`;
    res.status(200).json({
      reply: gandalfReply,
      audioFileUrl,
    });
  } catch (error) {
    logger.error("API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.info(`[Chat API] 500 Internal Server Error`);
    res.status(500).json({
      reply: "Error fetching response from Gandalf.",
      error: errorMessage,
    });
  }
}
