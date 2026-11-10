/**
 * API route for chat requests.
 *
 * Handles user input, calls Claude for characterful replies, and synthesizes audio using Google TTS.
 * Implements caching, logging, and rate limiting. Returns both text and audio URLs.
 *
 * @module api/chat
 */

import { after, type NextRequest } from "next/server";
import { synthesizeReplyAudio } from "../../../utils/chat/ttsReply";
import { generateRequestId, logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { setReplyCache, getReplyCache } from "../../../utils/cache";
import crypto from "crypto";
import {
  buildClaudeMessages,
  type ClaudeMessage,
} from "../../../utils/chat/conversationSummarizer";
import { generatePersonalityPrompt } from "../../../config/serverConfig";
import { sseResponse } from "../../../utils/sse";
import { sanitizeCharacterName } from "../../../utils/server/security";
import { stripActionEmotes, gracefullyWrapResponse } from "../../../utils/chat/chatReplyFormatting";
import {
  buildChatContext,
  buildSystemPrompt,
  resolveChatIdentity,
} from "../../../utils/chat/chatContext";
import { findChatInputProblem } from "../../../utils/chat/chatRequest";
import { createClaudeReply, streamClaudeReply } from "../../../utils/chat/chatReply";
import { readJson, withRoute } from "../../../utils/server/withRoute";
import { cleanupOldAudioFiles } from "../../../utils/chat/audioFileCleanup";
import { finalizeChatPersistence } from "../../../utils/chat/chatPersistence";

const LIMIT = {
  name: "chat",
  max: 10,
  message: "Too many chat requests from this IP, please try again later.",
};

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
 *                 description: >
 *                   Prior turns, oldest first, each prefixed with its speaker ("User: ..." or "Bot: ...").
 *                 items:
 *                   type: string
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
 *       408:
 *         description: Request timed out (20s)
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Claude or TTS call failed
 */
export const POST = withRoute(LIMIT, async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") || generateRequestId();

  try {
    // Periodic cleanup of old audio files
    requestCount++;
    if (requestCount % CLEANUP_INTERVAL === 0) {
      cleanupOldAudioFiles();
    }

    const body = await readJson(req);
    const userMessage = body.message;
    const requestPersonality =
      body.personality || (await generatePersonalityPrompt("a character chatbot")).prompt;
    // Same sanitization saved characters are stored under; also bounds what reaches prompts and file names.
    const botName = sanitizeCharacterName(body.botName) || "Character";
    const gender = body.gender;
    const conversationHistory = body.conversationHistory || [];
    const stream = body.stream === true; // Support streaming mode
    const voiceConfig = body.voiceConfig;
    // The client's internal "Introduce yourself..." prompt, not something the user typed;
    // see finalizeChatPersistence, which skips persisting it as a "User" turn.
    const isIntro = body.isIntro === true;

    const problem = findChatInputProblem({
      userMessage,
      personality: body.personality,
      conversationHistory,
      voiceConfig,
    });
    if (problem) {
      logEvent("info", problem.event, problem.message, sanitizeLogMeta({ requestId }));
      return Response.json({ error: problem.error, requestId }, { status: 400 });
    }

    const { botRow, personality, userName } = await resolveChatIdentity(
      req,
      botName,
      requestPersonality,
      body.userName,
    );

    const { conversationSummary, limitedHistory, newSummaryCheckpoint } = await buildChatContext(
      botRow,
      conversationHistory,
      botName,
      requestId,
    );
    const systemPrompt = buildSystemPrompt(personality, userName, conversationSummary);

    // One place for what every successful path does last: log it, then persist the turn. It runs
    // after the response is sent (`after`), so the client isn't kept waiting on the database.
    const finish = (
      reply: string,
      audioFileUrl: string | undefined,
      how: { cached: boolean; streamed: boolean },
    ) =>
      after(async () => {
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
      });

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
      // Logs a hash rather than the cache key itself: the key embeds the full
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
      finish(cachedReply, audioFileUrl, { cached: true, streamed: false });
      return Response.json({ reply: cachedReply, audioFileUrl, cached: true, requestId });
    }

    // Handle streaming mode
    if (stream) {
      return sseResponse(async (send) => {
        try {
          let botReply = await streamClaudeReply(send, systemPrompt, messages);

          if (!botReply || botReply.trim() === "") {
            logEvent(
              "warn",
              "chat_stream_empty_response",
              "Streamed response was empty",
              sanitizeLogMeta({ requestId }),
            );
            send({ error: "Empty response", done: true });
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

          send({ reply: botReply, audioFileUrl, done: true });
          setReplyCache(cacheKey, botReply);
          finish(botReply, audioFileUrl, { cached: false, streamed: true });
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
          send({ error: "Streaming failed", done: true });
        }
      });
    }

    // Non-streaming mode
    const reply = await createClaudeReply(systemPrompt, messages, requestId);
    if (reply === null) {
      return Response.json({ reply: "Request timed out.", requestId }, { status: 408 });
    }
    const botReply = stripActionEmotes(gracefullyWrapResponse(reply));

    const audioFileUrl = await synthesizeReplyAudio(
      botReply,
      botName,
      gender,
      voiceConfig,
      false,
      "chat",
    );
    setReplyCache(cacheKey, botReply);
    finish(botReply, audioFileUrl, { cached: false, streamed: false });
    return Response.json({ reply: botReply, audioFileUrl, requestId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logEvent(
      "error",
      "chat_request_failed",
      "Chat request failed",
      sanitizeLogMeta({ requestId, error: errorMessage }),
    );
    // The cause is in the log (by requestId); upstream error text isn't for the client.
    return Response.json(
      {
        reply: "Error fetching response from bot.",
        error: "Chat request failed",
        requestId,
      },
      { status: 500 },
    );
  }
});
