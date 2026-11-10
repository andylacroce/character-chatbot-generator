/**
 * API endpoint for generating downloadable chat transcripts.
 * Accepts POST requests with messages (up to 10MB) and returns HTML document.
 */

import type { NextRequest } from "next/server";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRoute, readJson } from "../../../utils/server/withRoute";
import { findTranscriptProblem } from "../../../utils/chat/transcriptRequest";
import {
  defaultExportTimestamp,
  renderTranscriptHtml,
  transcriptFilename,
} from "../../../utils/chat/transcriptHtml";

const LIMIT = {
  name: "transcript",
  max: 10,
  message: "Too many transcript requests from this IP, please try again later.",
};

/**
 * Next.js API route handler for generating and downloading chat transcripts.
 * Accepts POST requests with a messages array and returns a text file.
 * @returns {Promise<void>} Resolves when the response is sent.
 *
 * @swagger
 * /transcript:
 *   post:
 *     summary: Generate a downloadable chat transcript
 *     description: >
 *       Renders the given messages as a styled, self-contained HTML document
 *       (all text HTML-escaped). Body size limit 10MB, message count limit
 *       10000, total messages payload limit 5MB. Rate limited to 10 requests/
 *       minute/IP.
 *     tags: [Transcript]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 maxItems: 10000
 *                 items:
 *                   type: object
 *                   required: [sender, text]
 *                   properties:
 *                     sender:
 *                       type: string
 *                     text:
 *                       type: string
 *               bot:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   name:
 *                     type: string
 *                   avatarUrl:
 *                     type: string
 *               exportedAt:
 *                 type: string
 *                 nullable: true
 *               userName:
 *                 type: string
 *                 nullable: true
 *                 description: The visitor's preferred name, shown instead of "Me" on their own messages.
 *     responses:
 *       200:
 *         description: HTML transcript document
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid request body
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
export const POST = withRoute(LIMIT, async (req: NextRequest) => {
  const body = await readJson(req);
  // Extract messages from request body (sent by downloadTranscript utility)
  const { messages, bot, exportedAt, userName } = body;
  const senderName = typeof userName === "string" && userName.trim() ? userName.trim() : "Me";

  const problem = findTranscriptProblem({ messages, bot });
  if (problem) {
    logEvent(
      problem.level,
      "transcript_bad_request",
      problem.message,
      sanitizeLogMeta(problem.meta),
    );
    return Response.json({ error: problem.error }, { status: 400 });
  }

  // Use friendly timestamp if provided, otherwise generate machine-readable one
  const displayTimestamp =
    exportedAt && typeof exportedAt === "string" ? exportedAt : defaultExportTimestamp();
  const filename = transcriptFilename();

  const htmlTranscript = renderTranscriptHtml({
    filename,
    displayTimestamp,
    bot,
    messages,
    senderName,
  });

  // CodeQL [js/reflected-xss] - All user inputs are validated and properly HTML-escaped before insertion into the HTML template
  logEvent(
    "info",
    "transcript_sent",
    "Transcript sent for display",
    sanitizeLogMeta({ messageCount: messages.length }),
  );
  // CodeQL [js/reflected-xss] - All user inputs are validated and properly HTML-escaped before insertion into the HTML template
  return new Response(htmlTranscript, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
