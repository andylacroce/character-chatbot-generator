/**
 * API endpoint for generating downloadable chat transcripts.
 * Accepts POST requests with messages (up to 10MB) and returns HTML document.
 */

import { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { createRateLimiter, applyRateLimit } from "../../utils/server/rateLimit";
import { withRequestLog } from "../../utils/server/withRequestLog";
import { findTranscriptProblem } from "../../utils/chat/transcriptRequest";
import {
  defaultExportTimestamp,
  isValidAvatarUrl,
  renderTranscriptHtml,
  transcriptFilename,
} from "../../utils/chat/transcriptHtml";

// Re-exported because the avatar check is part of this route's tested surface.
export { isValidAvatarUrl };

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

/** Rate limiter: 10 requests per minute per IP to prevent transcript generation abuse. */
const transcriptRateLimit = createRateLimiter({
  name: "transcript",
  max: 10,
  message: "Too many transcript requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for generating and downloading chat transcripts.
 * Accepts POST requests with a messages array and returns a text file.
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
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
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    logEvent(
      "info",
      "transcript_method_not_allowed",
      "Method not allowed",
      sanitizeLogMeta({ method: req.method }),
    );
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  // Apply rate limiting middleware to this request
  if (!(await applyRateLimit(transcriptRateLimit, req, res))) {
    return;
  }

  // Extract messages from request body (sent by downloadTranscript utility)
  const { messages, bot, exportedAt, userName } = req.body;
  const senderName = typeof userName === "string" && userName.trim() ? userName.trim() : "Me";

  const problem = findTranscriptProblem({ messages, bot });
  if (problem) {
    logEvent(
      problem.level,
      "transcript_bad_request",
      problem.message,
      sanitizeLogMeta(problem.meta),
    );
    res.status(400).json({ error: problem.error });
    return;
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

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // CodeQL [js/reflected-xss] - All user inputs are validated and properly HTML-escaped before insertion into the HTML template
  res.status(200).send(htmlTranscript);
  logEvent(
    "info",
    "transcript_sent",
    "Transcript sent for display",
    sanitizeLogMeta({ messageCount: messages.length }),
  );
}

export default withRequestLog(handler);
