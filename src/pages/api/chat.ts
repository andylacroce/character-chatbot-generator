/**
 * API route for chat requests.
 *
 * Handles user input, calls Claude for characterful replies, and synthesizes audio using Google TTS.
 * Implements caching, logging, and rate limiting. Returns both text and audio URLs.
 *
 * @module api/chat
 */

import { NextApiRequest, NextApiResponse } from "next";
import { synthesizeReplyAudio } from "../../utils/ttsReply";
import { generateRequestId, logEvent, sanitizeLogMeta } from "../../utils/logger";
import { setReplyCache, getReplyCache } from "../../utils/cache";
import crypto from "crypto";
import { getClaudeModel } from "../../utils/claudeModelSelector";
import { createRateLimiter, applyRateLimit } from "../../utils/rateLimit";
import { buildClaudeMessages, type ClaudeMessage } from "../../utils/conversationSummarizer";
import { generatePersonalityPrompt } from "../../config/serverConfig";
import anthropic from "../../utils/anthropicClient";
import { getSessionUserId } from "../../utils/getSessionUserId";
import { setSseHeaders, writeSseFrame } from "../../utils/sse";
import { sanitizeCharacterName, sanitizeUserName } from "../../utils/security";
import {
  isClaudeResponse,
  stripActionEmotes,
  gracefullyWrapResponse,
} from "../../utils/chatReplyFormatting";
import { buildChatContext, buildSystemPrompt } from "../../utils/chatContext";
import { withRequestLog } from "../../utils/withRequestLog";
import { cleanupOldAudioFiles } from "../../utils/audioFileCleanup";
import {
  lookupBot,
  lookupUserPreferredName,
  finalizeChatPersistence,
} from "../../utils/chatPersistence";

/** Rate limiter for chat endpoint: 10 requests per minute per IP. */
const chatRateLimit = createRateLimiter({
  name: "chat",
  max: 10,
  message: "Too many chat requests from this IP, please try again later.",
});

/** Input ceilings: generous for real use, but bound what one request can make Claude read. */
const MAX_MESSAGE_LENGTH = 4000;
const MAX_PERSONALITY_LENGTH = 20000;
const MAX_HISTORY_ENTRIES = 200;

let requestCount = 0;
const CLEANUP_INTERVAL = 100; // Trigger cleanup every 100 API requests

/**
 * Next.js API route handler for chat requests.
 * Handles user input, calls Claude, and returns the character chatbot's reply and audio.
 *
 * @swagger
 * /chat:
 *   post:
 *     summary: Send a chat message and get the character's reply
 *     description: >
 *       Calls Claude for an in-character reply and synthesizes TTS audio. History
 *       beyond 20 messages is summarized before the call. Identical
 *       (botName, personality, recent history, message) requests are served from
 *       an in-memory cache. Rate limited to 10 requests/minute/IP. When
 *       `stream: true`, the response is `text/event-stream` instead of JSON — see
 *       the two response bodies below. For a signed-in user's saved character, the
 *       server ignores the request's `personality`/`conversationHistory` in favor
 *       of its own stored copy and message history, and persists each turn — see
 *       CLAUDE.md's account-persistence phase 3c. Guests are unaffected.
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message, voiceConfig]
 *             properties:
 *               message:
 *                 type: string
 *               personality:
 *                 type: string
 *               botName:
 *                 type: string
 *                 default: Character
 *               gender:
 *                 type: string
 *               conversationHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     sender:
 *                       type: string
 *                     text:
 *                       type: string
 *               voiceConfig:
 *                 type: object
 *               stream:
 *                 type: boolean
 *                 default: false
 *               userName:
 *                 type: string
 *                 description: >
 *                   The human user's preferred name, used to personalize the character's
 *                   greeting. For a signed-in user, the server's own stored value (see
 *                   /user-profile) takes precedence over this once one is set.
 *     responses:
 *       200:
 *         description: >
 *           JSON reply (default), or a text/event-stream of
 *           `data: {"chunk": string, "done": false}` frames followed by a final
 *           `data: {"reply": string, "audioFileUrl": string, "done": true}` frame
 *           when `stream: true`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                 audioFileUrl:
 *                   type: string
 *                 cached:
 *                   type: boolean
 *                 requestId:
 *                   type: string
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Message or voice config missing
 *       405:
 *         description: Method not allowed
 *       408:
 *         description: Request timed out (20s)
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Claude or TTS call failed
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = req.headers["x-request-id"] || generateRequestId();

  // Apply rate limiting
  if (!(await applyRateLimit(chatRateLimit, req, res))) {
    return;
  }

  if (req.method !== "POST") {
    logEvent(
      "info",
      "chat_method_not_allowed",
      "Method not allowed",
      sanitizeLogMeta({ method: req.method, requestId }),
    );
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
    const requestPersonality =
      req.body.personality || (await generatePersonalityPrompt("a character chatbot")).prompt;
    // Same sanitization saved characters are stored under; also bounds what reaches prompts and file names.
    const botName = sanitizeCharacterName(req.body.botName) || "Character";
    const gender = req.body.gender;
    const conversationHistory = req.body.conversationHistory || [];
    const stream = req.body.stream === true; // Support streaming mode
    const voiceConfig = req.body.voiceConfig;
    // The client's internal "Introduce yourself..." prompt, not something the user typed —
    // see finalizeChatPersistence, which skips persisting it as a "User" turn.
    const isIntro = req.body.isIntro === true;

    if (
      typeof userMessage === "string" &&
      (userMessage.length > MAX_MESSAGE_LENGTH ||
        (typeof req.body.personality === "string" &&
          req.body.personality.length > MAX_PERSONALITY_LENGTH) ||
        (Array.isArray(conversationHistory) && conversationHistory.length > MAX_HISTORY_ENTRIES))
    ) {
      logEvent(
        "info",
        "chat_bad_request_too_large",
        "Chat input too large",
        sanitizeLogMeta({ requestId }),
      );
      res.status(400).json({ error: "Message, personality, or history is too long", requestId });
      return;
    }
    if (!userMessage) {
      logEvent(
        "info",
        "chat_bad_request_message",
        "Message is required",
        sanitizeLogMeta({ requestId }),
      );
      res.status(400).json({ error: "Message is required", requestId });
      return;
    }
    if (!voiceConfig || typeof voiceConfig !== "object") {
      logEvent(
        "info",
        "chat_bad_request_voice_config",
        "Voice config is required",
        sanitizeLogMeta({ requestId }),
      );
      res.status(400).json({ error: "Voice config is required", requestId });
      return;
    }

    // For a signed-in user's saved character, the server becomes the source of truth for
    // personality/history instead of trusting the client-supplied values on every request —
    // same rationale as bot ownership in pages/api/bots.ts. Guests, no DATABASE_URL, or a
    // character never saved server-side (e.g. a copyright-warning override — see
    // CopyrightWarningModal, never persisted at all) fall through to today's fully
    // client-authoritative behavior, unchanged below.
    const userId = await getSessionUserId(req);
    const botRow = userId ? await lookupBot(userId, botName) : null;
    const personality = botRow ? botRow.personality : requestPersonality;

    // Same server-authoritative-once-set pattern as personality above: a signed-in
    // user's own stored preferred name (pages/api/user-profile.ts) wins once they've set
    // one, so it can't be spoofed differently on a later request; otherwise fall back to
    // whatever the client sent (a guest, or a signed-in user who hasn't set one yet).
    const storedUserName = userId ? await lookupUserPreferredName(userId) : null;
    const userName =
      storedUserName ||
      (typeof req.body.userName === "string" ? sanitizeUserName(req.body.userName) : "");

    const { conversationSummary, limitedHistory, newSummaryCheckpoint } = await buildChatContext(
      botRow,
      conversationHistory,
      botName,
      requestId,
    );
    const systemPrompt = buildSystemPrompt(personality, userName, conversationSummary);

    // One place for what every successful path does last: log it, then persist the turn.
    const finish = async (
      reply: string,
      audioFileUrl: string | undefined,
      how: { cached: boolean; streamed: boolean },
    ) => {
      logEvent(
        "info",
        "chat_reply_sent",
        "Reply sent",
        sanitizeLogMeta({
          requestId,
          botName,
          userMessageLength: userMessage.length,
          botReplyLength: reply.length,
          ...how,
          hasAudio: !!audioFileUrl,
        }),
      );
      await finalizeChatPersistence(
        botRow,
        userMessage,
        botName,
        reply,
        newSummaryCheckpoint,
        isIntro,
      );
    };

    // Build messages array: full conversation history (verbatim) + new user message
    const messages: ClaudeMessage[] = buildClaudeMessages(limitedHistory, userMessage);

    // --- API response caching logic ---
    const cacheKey = JSON.stringify({
      botName,
      personality,
      history: limitedHistory.slice(-10),
      userMessage,
      userName,
    });
    const cachedReply = getReplyCache(cacheKey);
    if (cachedReply) {
      // Logs a hash rather than the cache key itself — the key embeds the full
      // personality and recent history, which shouldn't be written to logs verbatim.
      const cacheKeyHash = crypto.createHash("sha256").update(cacheKey).digest("hex").slice(0, 16);
      logEvent(
        "info",
        "chat_cache_hit",
        "Serving cached reply",
        sanitizeLogMeta({ requestId, cacheKeyHash }),
      );
      const audioFileUrl = await synthesizeReplyAudio(
        cachedReply,
        botName,
        gender,
        voiceConfig,
        false,
        "chat",
      );
      res.status(200).json({ reply: cachedReply, audioFileUrl, cached: true, requestId });
      await finish(cachedReply, audioFileUrl, { cached: true, streamed: false });
      return;
    }

    // Timeout to avoid hanging
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 20000));

    // Handle streaming mode
    if (stream) {
      setSseHeaders(res);

      try {
        const streamResponse = anthropic.messages.stream({
          model: getClaudeModel("text"),
          system: systemPrompt,
          messages,
          max_tokens: 500,
          temperature: 0.7,
          stop_sequences: ["User:", "Bot:"],
        });

        let botReply = "";

        for await (const chunk of streamResponse) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            const content = chunk.delta.text;
            if (content) {
              botReply += content;
              writeSseFrame(res, { chunk: content, done: false });
            }
          }
        }

        if (!botReply || botReply.trim() === "") {
          logEvent(
            "warn",
            "chat_stream_empty_response",
            "Streamed response was empty",
            sanitizeLogMeta({ requestId }),
          );
          writeSseFrame(res, { error: "Empty response", done: true });
          res.end();
          return;
        }

        botReply = stripActionEmotes(gracefullyWrapResponse(botReply));

        // Audio is an enhancement: botReply is already streamed, so a TTS failure just omits the URL.
        const audioFileUrl = await synthesizeReplyAudio(
          botReply,
          botName,
          gender,
          voiceConfig,
          false,
          "chat",
        );

        writeSseFrame(res, { reply: botReply, audioFileUrl, done: true });
        res.end();

        setReplyCache(cacheKey, botReply);
        await finish(botReply, audioFileUrl, { cached: false, streamed: true });
        return;
      } catch (streamErr) {
        logEvent(
          "error",
          "chat_stream_failed",
          "Streaming chat response failed",
          sanitizeLogMeta({
            requestId,
            error: streamErr instanceof Error ? streamErr.message : String(streamErr),
          }),
        );
        writeSseFrame(res, { error: "Streaming failed", done: true });
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
      logEvent(
        "warn",
        "chat_timeout",
        "Request timed out waiting for Claude",
        sanitizeLogMeta({ requestId }),
      );
      res.status(408).json({ reply: "Request timed out.", requestId });
      return;
    }
    if (!isClaudeResponse(result)) {
      logEvent(
        "error",
        "chat_invalid_claude_response",
        "Invalid response shape from Claude",
        sanitizeLogMeta({ requestId }),
      );
      throw new Error("Invalid response from Claude");
    }
    let botReply =
      result.content[0]?.type === "text"
        ? (result.content[0] as { type: "text"; text: string }).text.trim()
        : "";

    if (!botReply || botReply.trim() === "") {
      logEvent(
        "error",
        "chat_empty_bot_response",
        "Generated bot response was empty",
        sanitizeLogMeta({ requestId }),
      );
      throw new Error("Generated bot response is empty.");
    }

    botReply = stripActionEmotes(gracefullyWrapResponse(botReply));

    const audioFileUrl = await synthesizeReplyAudio(
      botReply,
      botName,
      gender,
      voiceConfig,
      false,
      "chat",
    );
    setReplyCache(cacheKey, botReply);
    res.status(200).json({ reply: botReply, audioFileUrl, requestId });
    await finish(botReply, audioFileUrl, { cached: false, streamed: false });
    return;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logEvent(
      "error",
      "chat_request_failed",
      "Chat request failed",
      sanitizeLogMeta({ requestId, error: errorMessage }),
    );
    // The cause is in the log (by requestId); upstream error text isn't for the client.
    res.status(500).json({
      reply: "Error fetching response from bot.",
      error: "Chat request failed",
      requestId,
    });
    return;
  }
}

export default withRequestLog(handler);
