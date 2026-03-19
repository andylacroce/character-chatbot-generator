/**
 * API route for chat requests.
 *
 * Handles user input, calls Claude for characterful replies, and synthesizes audio using Google TTS.
 * Implements caching, logging, and rate limiting. Returns both text and audio URLs.
 *
 * @module api/chat
 */

import { NextApiRequest, NextApiResponse } from "next";
import sanitizeFilename from "sanitize-filename";
import { synthesizeSpeechToFile } from "../../src/utils/tts";
import fs from "fs";
import path from "path";
import ipinfo from "ipinfo";
import logger, { generateRequestId } from "../../src/utils/logger";
import { setReplyCache, getReplyCache } from "../../src/utils/cache";
import crypto from "crypto";
import { getClaudeModel } from "../../src/utils/claudeModelSelector";
import { createRateLimiter } from "../../src/utils/rateLimit";
import { normalizeStudioVoice, buildSsml } from "../../src/utils/voiceHelpers";
import { summarizeConversation, buildClaudeMessages, type ClaudeMessage } from "../../src/utils/conversationSummarizer";
import { generatePersonalityPrompt } from "../../src/config/serverConfig";
import anthropic from "../../src/utils/anthropicClient";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  throw new Error(
    "Missing GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable",
  );
}

/** Rate limiter for chat endpoint: 10 requests per minute per IP. */
const chatRateLimit = createRateLimiter(
  10,
  "Too many chat requests from this IP, please try again later.",
);

/**
 * Periodic cleanup of audio files from /tmp to prevent disk bloat.
 * Runs every CLEANUP_INTERVAL requests.
 */
let requestCount = 0;
const CLEANUP_INTERVAL = 100; // Trigger cleanup every 100 API requests
const AUDIO_FILE_MAX_AGE = 24 * 60 * 60 * 1000; // Delete audio files older than 24 hours

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
          // Silently skip individual files that fail to delete (may be in use)
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

/**
 * Deterministic JSON serializer for cache key generation.
 * - Sorts object keys alphabetically
 * - Recurses through arrays and objects
 * - Preserves types for consistent keys across nodes
 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}';
}

function getAudioCacheKey(text: string, voiceConfig: object) {
  return crypto.createHash('sha256')
    .update(text)
    .update(stableStringify(voiceConfig))
    .digest('hex');
}


/**
 * Checks if the given object is a valid Claude messages response.
 */
function isClaudeResponse(
  obj: unknown,
): obj is { content: { type: string; text?: string }[] } {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "content" in obj &&
    Array.isArray((obj as { content: unknown }).content)
  );
}

/**
 * Removes roleplay action emotes (*action text*) from a response.
 * Characters should speak in dialogue/prose only, not stage directions.
 */
function stripActionEmotes(response: string): string {
  // Remove *...* patterns (action emotes) and clean up extra whitespace
  return response.replace(/\*[^*]+\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Gracefully wraps a response that might be truncated by adding an appropriate ending.
 */
function gracefullyWrapResponse(response: string): string {
  if (!response || response.length === 0) return response;

  const trimmed = response.trimEnd();

  // If already ends with proper punctuation, return as-is
  if (/[.!?;:]\s*$/.test(trimmed)) {
    return trimmed;
  }

  // If ends mid-sentence with comma, add more natural completion
  if (trimmed.endsWith(',')) {
    return trimmed.slice(0, -1) + '.';
  }

  // If ends mid-word or incomplete, try to find last complete sentence
  const lastPeriod = trimmed.lastIndexOf('.');
  const lastExclamation = trimmed.lastIndexOf('!');
  const lastQuestion = trimmed.lastIndexOf('?');
  const lastSemicolon = trimmed.lastIndexOf(';');

  const lastPunctuation = Math.max(lastPeriod, lastExclamation, lastQuestion, lastSemicolon);

  // If we found proper punctuation before the end, use up to that point
  if (lastPunctuation > trimmed.length * 0.6) {
    return trimmed.substring(0, lastPunctuation + 1);
  }

  // Otherwise, try to find last complete word/phrase and end it gracefully
  const lastSpace = trimmed.lastIndexOf(' ', trimmed.length - 1);
  if (lastSpace > 0 && trimmed.length - lastSpace > 10) {
    return trimmed.substring(0, lastSpace) + '.';
  }

  // Last resort: just add a period
  return trimmed + '.';
}

/**
 * Next.js API route handler for chat requests.
 * Handles user input, calls Claude, and returns the character chatbot's reply and audio.
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
    const voiceConfig = req.body.voiceConfig;

    if (!userMessage) {
      logger.info(`[Chat API] 400 Bad Request: Message is required | requestId=${requestId}`);
      res.status(400).json({ error: "Message is required", requestId });
      return;
    }
    if (!voiceConfig || typeof voiceConfig !== 'object') {
      logger.info(`[Chat API] 400 Bad Request: Voice config is required | requestId=${requestId}`);
      res.status(400).json({ error: "Voice config is required", requestId });
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

    // Implement conversation summarization when history exceeds 20 messages
    let conversationSummary: string | undefined;
    let limitedHistory = conversationHistory;

    if (conversationHistory.length > 20) {
      const recentHistory = conversationHistory.slice(-20);
      const oldHistory = conversationHistory.slice(0, -20);

      // Build messages from old history for summarization
      const oldMessages = buildClaudeMessages(oldHistory, "").slice(0, -1); // exclude the empty user message at end

      if (oldMessages.length > 0) {
        conversationSummary = await summarizeConversation(anthropic, oldMessages, botName);
        logger.info(`[Chat API] Summarized ${oldHistory.length} old messages | requestId=${requestId}`);
      }

      limitedHistory = recentHistory;
    }

    const historyContextInstructions = `
CRITICAL CONTEXT INSTRUCTIONS:
- You have access to the full conversation history below. Read it carefully to understand narrative context and character consistency.
- If the user asks to "continue", "go on", "keep going", or similar, ALWAYS resume the exact previous narrative from where it left off.
- Do NOT start a new story or narrative when asked to continue - continue the existing one with the same characters, plot threads, and setting.
- Maintain character voice, tone, and personality traits consistently throughout your response, matching the style established in the conversation history.
- If the previous response was incomplete or truncated, seamlessly continue from the exact point where it ended.
- Pay attention to all plot details, character names, and setting information from the conversation to ensure narrative continuity.`;

    const systemPrompt = conversationSummary
      ? `${personality}\n${historyContextInstructions}\n\nPrevious conversation summary: ${conversationSummary}`
      : `${personality}\n${historyContextInstructions}`;

    // Build messages array: full conversation history (verbatim) + new user message
    const messages: ClaudeMessage[] = buildClaudeMessages(limitedHistory, userMessage);

    // --- API response caching logic ---
    const cacheKey = JSON.stringify({
      botName,
      personality,
      history: limitedHistory.slice(-10),
      userMessage,
    });
    const cachedReply = getReplyCache(cacheKey);
    if (cachedReply) {
      logger.info(`[Chat API] Cache hit for key: ${cacheKey} | requestId=${requestId}`);
      const voiceConfigToUse = voiceConfig;
      logger.info(`[TTS] Using voice for botName='${botName}': ${JSON.stringify(voiceConfigToUse)}`);
      const selectedVoice = normalizeStudioVoice(voiceConfigToUse);
      const ssmlText = buildSsml(cachedReply, selectedVoice);
      const tmpDir = "/tmp";
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
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
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      try {
        const streamResponse = anthropic.messages.stream({
          model: getClaudeModel("text"),
          system: systemPrompt,
          messages,
          max_tokens: 500,
          temperature: 0.7,
          stop_sequences: ["User:", "Bot:"],
        });

        let botReply = '';

        for await (const chunk of streamResponse) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const content = chunk.delta.text;
            if (content) {
              botReply += content;
              res.write(`data: ${JSON.stringify({ chunk: content, done: false })}\n\n`);
            }
          }
        }

        if (!botReply || botReply.trim() === "") {
          res.write(`data: ${JSON.stringify({ error: "Empty response", done: true })}\n\n`);
          res.end();
          return;
        }

        botReply = stripActionEmotes(gracefullyWrapResponse(botReply));

        const voiceConfigToUse = voiceConfig;
        const selectedVoice = normalizeStudioVoice(voiceConfigToUse);

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
        const audioFileUrl = `/api/audio?file=${audioFileName}&text=${encodeURIComponent(botReply)}&botName=${encodeURIComponent(botName)}&gender=${encodeURIComponent(gender || '')}&voiceConfig=${encodeURIComponent(JSON.stringify(voiceConfigToUse))}`;

        res.write(`data: ${JSON.stringify({ reply: botReply, audioFileUrl, done: true })}\n\n`);
        res.end();

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

    // Non-streaming mode
    const result = await Promise.race([
      anthropic.messages.create({
        model: getClaudeModel("text"),
        system: systemPrompt,
        messages,
        max_tokens: 500,
        temperature: 0.7,
        stop_sequences: ["User:", "Bot:"],
      }),
      timeout,
    ]);

    if (result && typeof result === "object" && "timeout" in result) {
      logger.info(`[Chat API] 408 Request Timeout | requestId=${requestId}`);
      res.status(408).json({ reply: "Request timed out.", requestId });
      return;
    }
    if (!isClaudeResponse(result)) {
      logger.info(`[Chat API] 500 Internal Server Error: Invalid Claude response | requestId=${requestId}`);
      throw new Error("Invalid response from Claude");
    }
    let botReply = result.content[0]?.type === "text" ? (result.content[0] as { type: "text"; text: string }).text.trim() : "";

    if (!botReply || botReply.trim() === "") {
      logger.info(`[Chat API] 500 Internal Server Error: Empty bot response | requestId=${requestId}`);
      throw new Error("Generated bot response is empty.");
    }

    botReply = gracefullyWrapResponse(botReply);

    const voiceConfigToUse = voiceConfig;
    const voiceConfigHash = crypto.createHash("sha256").update(JSON.stringify(voiceConfigToUse)).digest("hex");
    logger.info(`[TTS] Using voice for botName='${botName}', voiceConfigHash=${voiceConfigHash}: ${JSON.stringify(voiceConfigToUse)}`);
    const selectedVoice = normalizeStudioVoice(voiceConfigToUse);
    const ssmlText = buildSsml(botReply, selectedVoice);
    const tmpDir = "/tmp";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
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
    try {
      const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
      if (!fs.existsSync(txtFilePath) || fs.readFileSync(txtFilePath, "utf8").trim() !== botReply.trim()) {
        fs.writeFileSync(txtFilePath, botReply, "utf8");
      }
    } catch (err) {
      logger.error("Failed to ensure .txt file for audio reply:", { error: err });
    }
    setReplyCache(cacheKey, botReply);
    logger.info(
      `${timestamp}|${userIp}|${userLocation}|${userMessage.replace(/"/g, '""')}|${botReply.replace(/"/g, '""')}|requestId=${requestId}`,
    );
    logger.info(`[Chat API] 200 OK: Reply and audioFileUrl sent | requestId=${requestId}`);
    const audioFileUrl = `/api/audio?file=${audioFileName}&text=${encodeURIComponent(botReply)}&botName=${encodeURIComponent(botName)}&gender=${encodeURIComponent(gender || '')}&voiceConfig=${encodeURIComponent(JSON.stringify(voiceConfigToUse))}`;
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
