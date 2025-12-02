/**
 * API route for chat requests.
 *
 * Handles user input, calls OpenAI for characterful replies, and synthesizes audio using Google TTS.
 * Implements caching, logging, and rate limiting. Returns both text and audio URLs.
 *
 * @module api/chat
 */

import { NextApiRequest, NextApiResponse } from "next";
import sanitizeFilename from "sanitize-filename";
import OpenAI from "openai";
import { synthesizeSpeechToFile } from "../../src/utils/tts";
import fs from "fs";
import path from "path";
import ipinfo from "ipinfo";
import logger, { generateRequestId } from "../../src/utils/logger";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { setReplyCache, getReplyCache } from "../../src/utils/cache";
import crypto from "crypto";
import { getOpenAIModel } from "../../src/utils/openaiModelSelector";
import rateLimit from "express-rate-limit";
import { generatePersonalityPrompt } from "../../src/config/serverConfig";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  throw new Error(
    "Missing GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable",
  );
}



const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("Missing OpenAI API key");
}
const openai = new OpenAI({ apiKey });

// Rate limiter: 10 requests per minute per IP
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: "Too many chat requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Handle IP extraction for Next.js API routes
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           (req.headers['x-real-ip'] as string) ||
           (req.connection?.remoteAddress) ||
           (req.socket?.remoteAddress) ||
           'unknown';
  },
});

// Cleanup old audio files periodically (every 100 requests)
let requestCount = 0;
const CLEANUP_INTERVAL = 100;
const AUDIO_FILE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

function cleanupOldAudioFiles() {
  try {
    const tmpDir = "/tmp";
    if (!fs.existsSync(tmpDir)) return;
    
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const file of files) {
      if (file.endsWith('.mp3') || file.endsWith('.txt')) {
        const filePath = path.join(tmpDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtime.getTime() > AUDIO_FILE_MAX_AGE) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old audio files`);
    }
  } catch (err) {
    logger.error("Error during audio file cleanup:", { error: err });
  }
}

// Deterministic serializer for objects to ensure identical cache keys across nodes
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}';
}

function getAudioCacheKey(text: string, voiceConfig: Record<string, unknown>) {
  return crypto.createHash('sha256')
    .update(text)
    .update(stableStringify(voiceConfig))
    .digest('hex');
}



/**
 * Summarizes conversation history when it exceeds the limit.
 * Uses OpenAI to create a concise summary of older messages.
 * @param {ChatCompletionMessageParam[]} messages - The messages to summarize (excluding system prompt)
 * @param {string} botName - The bot's name for context
 * @returns {Promise<string>} A summary of the conversation
 */
async function summarizeConversation(
  messages: ChatCompletionMessageParam[],
  botName: string
): Promise<string> {
  try {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : botName}: ${m.content}`)
      .join('\n');
    
    const summaryResponse = await openai.chat.completions.create({
      model: getOpenAIModel("text"),
      messages: [
        {
          role: "system",
          content: "Summarize this conversation concisely, capturing key topics, emotional tone, and important context. Keep it under 150 words."
        },
        {
          role: "user",
          content: conversationText
        }
      ],
      max_tokens: 200,
      temperature: 0.3,
    });
    
    return summaryResponse.choices[0]?.message?.content?.trim() ?? "Previous conversation history.";
  } catch (error) {
    logger.error("Failed to summarize conversation:", { error });
    return "Previous conversation covered various topics.";
  }
}

/**
 * Checks if the given object is a valid OpenAI chat completion response.
 * @param {any} obj - The object to check.
 * @returns {boolean} True if the object is a valid response.
 */
function isOpenAIResponse(
  obj: unknown,
): obj is { choices: { message: { content: string }; finish_reason?: string }[] } {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "choices" in obj &&
    Array.isArray((obj as { choices: unknown }).choices)
  );
}

/**
 * Builds the OpenAI chat message array from conversation history and user input.
 * @param {string[]} history - The conversation history (excluding the latest user message).
 * @param {string} userMessage - The latest user message.
 * @param {string} botName - The bot's name.
 * @param {string} personality - The system prompt/personality.
 * @param {string} [conversationSummary] - Optional summary of earlier conversation.
 * @returns {ChatCompletionMessageParam[]} The formatted message array for OpenAI API.
 */
function buildOpenAIMessages(
  history: string[],
  userMessage: string,
  botName: string,
  personality: string,
  conversationSummary?: string
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: conversationSummary 
        ? `${personality}\n\nPrevious conversation summary: ${conversationSummary}`
        : personality,
    },
  ];
  for (const entry of history) {
    if (entry.startsWith("User: ")) {
      messages.push({ role: "user", content: entry.replace(/^User: /, "") });
    } else if (entry.startsWith("Bot: ")) {
      messages.push({
        role: "assistant",
        content: entry.replace(/^Bot: /, ""),
      });
    }
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}

/**
 * Next.js API route handler for chat requests.
 * Handles user input, calls OpenAI, and returns the character chatbot's reply and audio.
 * - Accepts POST requests with a 'message' in the body.
 * - Calls OpenAI API with chat history and system prompt.
 * - Generates a character-style reply and synthesizes audio using Google TTS.
 * - Returns the reply and a URL to the generated audio file.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 * @throws {Error} On missing input, OpenAI/TTS errors, or internal failures.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const requestId = req.headers["x-request-id"] || generateRequestId();
  
  // Apply rate limiting
  await new Promise<void>((resolve) => {
    chatRateLimit(req, res, () => resolve());
  });
  if (res.headersSent) {
    return;
  }
  
  if (req.method !== "POST") {
    logger.info(`[Chat API] 405 Method Not Allowed for ${req.method} | requestId=${requestId}`);
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  try {
    // Periodic cleanup of old audio files
    requestCount++;
    if (requestCount % CLEANUP_INTERVAL === 0) {
      cleanupOldAudioFiles();
    }
    
    const userMessage = req.body.message;
    const personality = req.body.personality || generatePersonalityPrompt("a character chatbot");
    const botName = req.body.botName || "Character";
    const gender = req.body.gender;
    const conversationHistory = req.body.conversationHistory || [];
    const stream = req.body.stream === true; // Support streaming mode
    if (!userMessage) {
      logger.info(`[Chat API] 400 Bad Request: Message is required | requestId=${requestId}`);
      res.status(400).json({ error: "Message is required", requestId });
      return;
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
        logger.error("IP info error:", { error });
      }
    }

    const timestamp = new Date().toISOString();
    
    // Implement conversation summarization when history exceeds 50 messages
    let conversationSummary: string | undefined;
    let limitedHistory = conversationHistory;
    
    if (conversationHistory.length > 50) {
      // Keep last 20 messages and summarize the rest
      const recentHistory = conversationHistory.slice(-20);
      const oldHistory = conversationHistory.slice(0, -20);
      
      // Build messages from old history for summarization
      const oldMessages = buildOpenAIMessages(oldHistory, "", botName, personality).slice(1, -1); // exclude system and empty user message
      
      if (oldMessages.length > 0) {
        conversationSummary = await summarizeConversation(oldMessages, botName);
        logger.info(`[Chat API] Summarized ${oldHistory.length} old messages | requestId=${requestId}`);
      }
      
      limitedHistory = recentHistory;
    }
    
    // Build messages array with correct types
    const oldMessages = buildOpenAIMessages(limitedHistory.slice(0, -1), userMessage, botName, personality, conversationSummary).slice(1); // skip system prompt
    
    // Add prompt caching to system message to reduce costs
    const systemMessage: ChatCompletionMessageParam = {
      role: "system",
      content: conversationSummary 
        ? `${personality}\n\nPrevious conversation summary: ${conversationSummary}`
        : personality,
    } as ChatCompletionMessageParam;
    
    const messages: ChatCompletionMessageParam[] = [
      systemMessage,
      ...oldMessages
    ];

    // --- API response caching logic ---
    // Create a cache key based on botName, personality, and recent conversation context
    const cacheKey = JSON.stringify({
      botName,
      personality,
      history: limitedHistory.slice(-10), // last 10 exchanges for context
      userMessage,
    });
    const cachedReply = getReplyCache(cacheKey);
    if (cachedReply) {
      logger.info(`[Chat API] Cache hit for key: ${cacheKey} | requestId=${requestId}`);
      // Prepare TTS/audio as usual for the cached reply
      // Robust Studio voice detection
      const voiceConfig = req.body.voiceConfig || (await import("../../src/utils/characterVoices")).CHARACTER_VOICE_MAP["Default"];
      logger.info(`[TTS] Using voice for botName='${botName}': ${JSON.stringify(voiceConfig)}`);
      const isStudio = (voiceConfig.type === 'Studio') || (voiceConfig.name && voiceConfig.name.includes('Studio'));
      let selectedVoice = voiceConfig;
      if (isStudio) {
        const validStudioVoices = ['en-US-Studio-M', 'en-US-Studio-O'];
        if (!validStudioVoices.includes(voiceConfig.name)) {
          // fallback to en-US-Studio-M
          selectedVoice = {
            languageCodes: ['en-US'],
            name: 'en-US-Studio-M',
            ssmlGender: 1,
            type: 'Studio',
          };
        }
      }
      const pitch = typeof selectedVoice.pitch === 'number' ? selectedVoice.pitch : -13;
      const rate = typeof selectedVoice.rate === 'number' ? Math.round(selectedVoice.rate * 100) + '%' : '80%';
      let ssmlText;
      if (isStudio) {
        ssmlText = `<speak>${cachedReply}</speak>`;
      } else {
        ssmlText = `<speak><prosody pitch="${pitch}st" rate="${rate}"> ${cachedReply} </prosody></speak>`;
      }
      const tmpDir = "/tmp";
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      // --- Audio cache logic ---
      const audioCacheKey = getAudioCacheKey(cachedReply, selectedVoice);
      const audioFileName = sanitizeFilename(`${audioCacheKey}.mp3`);
      const audioFilePath = path.join(tmpDir, audioFileName);
      if (!fs.existsSync(audioFilePath)) {
        try {
          await synthesizeSpeechToFile({
            text: ssmlText,
            filePath: audioFilePath,
            ssml: true,
            voice: selectedVoice,
          });
          const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
          fs.writeFileSync(txtFilePath, cachedReply, "utf8");
          setReplyCache(audioFileName, cachedReply);
        } catch (error) {
          logger.error("Text-to-Speech API error (cache hit):", { error });
          const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
          res.status(500).json({ error: "Google Cloud TTS failed", details: errorMessage });
          return;
        }
      }
      // Ensure .txt file is always written and matches reply
      try {
        const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
        if (!fs.existsSync(txtFilePath) || fs.readFileSync(txtFilePath, "utf8").trim() !== cachedReply.trim()) {
          fs.writeFileSync(txtFilePath, cachedReply, "utf8");
        }
      } catch (err) {
        logger.error("Failed to ensure .txt file for audio reply (cache hit):", { error: err });
      }
      const audioFileUrl = `/api/audio?file=${audioFileName}&text=${encodeURIComponent(cachedReply)}&botName=${encodeURIComponent(botName)}&gender=${encodeURIComponent(gender || '')}&voiceConfig=${encodeURIComponent(JSON.stringify(voiceConfig))}`;
      return res.status(200).json({
        reply: cachedReply,
        audioFileUrl,
        cached: true,
        requestId
      });
    }

    // Timeout to avoid hanging
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 20000),
    );
    
    // Handle streaming mode
    if (stream) {
      // Set headers for Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      
      try {
        const streamResponse = await openai.chat.completions.create({
          model: getOpenAIModel("text"),
          messages,
          max_tokens: 150,
          temperature: 0.7,
          stream: true,
          stop: ["\n\n\n", "User:", "Bot:"],
          // Enable prompt caching for repeated system prompts (beta feature)
          store: true,
        });
        
        let botReply = '';
        
        // Stream response to client
        for await (const chunk of streamResponse) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            botReply += content;
            // Send chunk to client
            res.write(`data: ${JSON.stringify({ chunk: content, done: false })}\n\n`);
          }
        }
        
        if (!botReply || botReply.trim() === "") {
          res.write(`data: ${JSON.stringify({ error: "Empty response", done: true })}\n\n`);
          res.end();
          return;
        }
        
        // Generate audio after streaming is complete
        const voiceConfig = req.body.voiceConfig || (await import("../../src/utils/characterVoices")).CHARACTER_VOICE_MAP["Default"];
        const isStudio = (voiceConfig.type === 'Studio') || (voiceConfig.name && voiceConfig.name.includes('Studio'));
        let selectedVoice = voiceConfig;
        if (isStudio) {
          const validStudioVoices = ['en-US-Studio-M', 'en-US-Studio-O'];
          if (!validStudioVoices.includes(voiceConfig.name)) {
            selectedVoice = {
              languageCodes: ['en-US'],
              name: 'en-US-Studio-M',
              ssmlGender: 1,
              type: 'Studio',
            };
          }
        }
        
        const audioFileName = sanitizeFilename(`${botName}_${Date.now()}.mp3`);
        const audioDir = process.env.TTS_TMP_DIR || path.join(process.cwd(), "public", "audio");
        if (!fs.existsSync(audioDir)) {
          fs.mkdirSync(audioDir, { recursive: true });
        }
        const audioFilePath = path.join(audioDir, audioFileName);
        
        await synthesizeSpeechToFile({
          text: botReply,
          filePath: audioFilePath,
          ssml: false,
          voice: selectedVoice,
        });
        const audioFileUrl = `/api/audio?file=${audioFileName}&text=${encodeURIComponent(botReply)}&botName=${encodeURIComponent(botName)}&gender=${encodeURIComponent(gender || '')}&voiceConfig=${encodeURIComponent(JSON.stringify(voiceConfig))}`;
        
        // Send final message with audio URL
        res.write(`data: ${JSON.stringify({ reply: botReply, audioFileUrl, done: true })}\n\n`);
        res.end();
        
        // Cache and log
        setReplyCache(cacheKey, botReply);
        logger.info(`${timestamp}|${userIp}|${userLocation}|${userMessage.replace(/"/g, '""')}|${botReply.replace(/"/g, '""')}|requestId=${requestId}`);
        return;
      } catch (streamErr) {
        logger.error("Streaming error:", { error: streamErr });
        res.write(`data: ${JSON.stringify({ error: "Streaming failed", done: true })}\n\n`);
        res.end();
        return;
      }
    }
    
    // Non-streaming mode (original behavior)
    const result = await Promise.race([
      openai.chat.completions.create({
        model: getOpenAIModel("text"),
        messages,
        max_tokens: 150,
        temperature: 0.7,
        response_format: { type: "text" },
        stop: ["\n\n\n", "User:", "Bot:"],
        // Enable prompt caching for repeated system prompts (beta feature)
        store: true,
      }),
      timeout,
    ]);
    if (result && typeof result === "object" && "timeout" in result) {
      logger.info(`[Chat API] 408 Request Timeout | requestId=${requestId}`);
      res.status(408).json({ reply: "Request timed out.", requestId });
      return;
    }
    if (!isOpenAIResponse(result)) {
      logger.info(`[Chat API] 500 Internal Server Error: Invalid OpenAI response | requestId=${requestId}`);
      throw new Error("Invalid response from OpenAI");
    }
    const botReply = result.choices[0]?.message?.content?.trim() ?? "";
    
    if (!botReply || botReply.trim() === "") {
      logger.info(`[Chat API] 500 Internal Server Error: Empty bot response | requestId=${requestId}`);
      throw new Error("Generated bot response is empty.");
    }

    // Prepare TTS request (voice tuned for character)
    const voiceConfig = req.body.voiceConfig || (await import("../../src/utils/characterVoices")).CHARACTER_VOICE_MAP["Default"];
    // Add a hash to the voiceConfig for logging/debugging
    const voiceConfigHash = crypto.createHash("sha256").update(JSON.stringify(voiceConfig)).digest("hex");
    logger.info(`[TTS] Using voice for botName='${botName}', voiceConfigHash=${voiceConfigHash}: ${JSON.stringify(voiceConfig)}`);
    // Robust Studio voice detection
    const isStudio = (voiceConfig.type === 'Studio') || (voiceConfig.name && voiceConfig.name.includes('Studio'));
    let selectedVoice = voiceConfig;
    if (isStudio) {
      const validStudioVoices = ['en-US-Studio-M', 'en-US-Studio-O'];
      if (!validStudioVoices.includes(voiceConfig.name)) {
        // fallback to en-US-Studio-M
        selectedVoice = {
          languageCodes: ['en-US'],
          name: 'en-US-Studio-M',
          ssmlGender: 1,
          type: 'Studio',
        };
      }
    }
    const pitch = typeof selectedVoice.pitch === 'number' ? selectedVoice.pitch : -13;
    const rate = typeof selectedVoice.rate === 'number' ? Math.round(selectedVoice.rate * 100) + '%' : '80%';
    let ssmlText;
    if (isStudio) {
      ssmlText = `<speak>${botReply}</speak>`;
    } else {
      ssmlText = `<speak><prosody pitch="${pitch}st" rate="${rate}"> ${botReply} </prosody></speak>`;
    }
    const tmpDir = "/tmp";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    // --- Utility: top-level getAudioCacheKey is defined above and used for caching ---
    // --- Audio cache logic for OpenAI response (cache miss path) ---
    const audioCacheKey = getAudioCacheKey(botReply, selectedVoice);
    const audioFileName = sanitizeFilename(`${audioCacheKey}.mp3`);
    const audioFilePath = path.join(tmpDir, audioFileName);
    if (!fs.existsSync(audioFilePath)) {
      try {
        await synthesizeSpeechToFile({
          text: ssmlText,
          filePath: audioFilePath,
          ssml: true,
          voice: selectedVoice,
        });
        const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
        fs.writeFileSync(txtFilePath, botReply, "utf8");
        setReplyCache(audioFileName, botReply);
      } catch (error) {
        logger.error("Text-to-Speech API error:", { error });
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        res.status(500).json({ error: "Google Cloud TTS failed", details: errorMessage });
        return;
      }
    }
    // --- Ensure .txt file is always written and matches reply ---
    try {
      const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
      if (!fs.existsSync(txtFilePath) || fs.readFileSync(txtFilePath, "utf8").trim() !== botReply.trim()) {
        fs.writeFileSync(txtFilePath, botReply, "utf8");
      }
    } catch (err) {
      logger.error("Failed to ensure .txt file for audio reply:", { error: err });
    }
    // After getting botReply from OpenAI, add to cache:
    setReplyCache(cacheKey, botReply);
    logger.info(
      `${timestamp}|${userIp}|${userLocation}|${userMessage.replace(/"/g, '""')}|${botReply.replace(/"/g, '""')}|requestId=${requestId}`,
    );
    logger.info(`[Chat API] 200 OK: Reply and audioFileUrl sent | requestId=${requestId}`);
    // Return audioFileUrl with text param for stateless regeneration
    const audioFileUrl = `/api/audio?file=${audioFileName}&text=${encodeURIComponent(botReply)}&botName=${encodeURIComponent(botName)}&gender=${encodeURIComponent(gender || '')}&voiceConfig=${encodeURIComponent(JSON.stringify(voiceConfig))}`;
    res.status(200).json({
      reply: botReply,
      audioFileUrl,
      requestId
    });
    return;
  } catch (error) {
    logger.error(`API error | requestId=${requestId}:`, { error });
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.info(`[Chat API] 500 Internal Server Error | requestId=${requestId}`);
    res.status(500).json({
      reply: "Error fetching response from bot.",
      error: errorMessage,
      requestId
    });
    return;
  }
}

export default handler;
