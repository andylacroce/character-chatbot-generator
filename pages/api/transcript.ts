/**
 * API endpoint for generating downloadable chat transcripts.
 * Accepts POST requests with messages (up to 10MB) and returns HTML document.
 */

import { NextApiRequest, NextApiResponse } from "next";
import logger from "../../src/utils/logger";
import { createRateLimiter } from "../../src/utils/rateLimit";
import { sanitizeForDisplay, escapeHtml } from "../../src/utils/security";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
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
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    logger.info(`[Transcript API] 405 Method Not Allowed for ${req.method}`);
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  // Apply rate limiting middleware to this request
  await new Promise<void>((resolve) => {
    transcriptRateLimit(req, res, () => resolve());
  });
  if (res.headersSent) {
    return;
  }

  // Extract messages from request body (sent by downloadTranscript utility)
  const { messages, bot, exportedAt } = req.body;

  if (!Array.isArray(messages)) {
    logger.info(`[Transcript API] 400 Bad Request: Messages array required`);
    logger.error(
      "[Transcript API] Invalid request: Messages array required in JSON body.",
    );
    res.status(400).json({ error: "Messages array required" });
    return;
  }

  // Validate required fields and types
  if (bot !== undefined && (typeof bot !== 'object' || bot === null)) {
    res.status(400).json({ error: "bot must be an object" });
    return;
  }
  if (bot && typeof bot.name !== 'string') {
    res.status(400).json({ error: "bot.name must be a string" });
    return;
  }
  if (bot && typeof bot.avatarUrl !== 'string') {
    res.status(400).json({ error: "bot.avatarUrl must be a string" });
    return;
  }
  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null || typeof msg.sender !== 'string' || typeof msg.text !== 'string') {
      res.status(400).json({ error: "Invalid message format" });
      return;
    }
  }

  // Ensure message count is reasonable to prevent resource exhaustion
  if (messages.length > 10000) {
    logger.info(`[Transcript API] 400 Bad Request: Too many messages (${messages.length})`);
    res.status(400).json({ error: "Too many messages (max 10000)" });
    return;
  }

  // Ensure total payload size stays within limits to prevent abuse
  const totalSize = JSON.stringify(messages).length;
  if (totalSize > 5 * 1024 * 1024) { // 5MB size limit
    logger.info(`[Transcript API] 400 Bad Request: Transcript too large (${totalSize} bytes)`);
    res.status(400).json({ error: "Transcript too large (max 5MB)" });
    return;
  }

  logger.info(`[Transcript API] Received messages for download: ${messages.length}`);

  // Use friendly timestamp if provided, otherwise generate machine-readable one
  const displayTimestamp = exportedAt && typeof exportedAt === 'string' ? exportedAt : (() => {
    const now = new Date();
    return now.toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short"
    });
  })();

  // Generate descriptive filename for the HTML document
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `Character Chat Transcript ${datetime}.html`;

  logger.info(`[Transcript API] Generated filename: ${filename}`);

  // Generate formatted HTML transcript with styling and safety measures.
  // Palette, type pairing (Inter/Fraunces) and "no bubbles" transcript treatment
  // mirror the live chat page's immersive-stage design (ChatMessage.module.css,
  // globals.css) so a downloaded transcript still looks like this app. Unlike the
  // live app, this stays on the light palette always (no dark-mode media query)
  // since a downloaded/printed document should stay print-friendly rather than
  // follow the viewer's OS theme.
  const htmlTranscript = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${filename}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap');

        :root {
          --color-background: #f7f4ef;
          --color-surface-variant: #efe6de;
          --color-outline: #9c8f7d;
          --color-text: #18160f;
          --color-text-secondary: #5c5245;
          --color-accent: #3d6e73;
        }

        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem 1.25rem 4rem;
          background-color: var(--color-background);
          color: var(--color-text);
        }
        h1 {
          font-family: 'Fraunces', 'Inter', serif;
          font-weight: 500;
          font-size: 1.65rem;
          color: var(--color-text);
          text-align: center;
          margin-bottom: 0.5rem;
        }
        h2 {
          font-family: 'Fraunces', 'Inter', serif;
          font-weight: 500;
          font-size: 1.3rem;
          color: var(--color-text);
          text-align: center;
          margin-top: 0.65rem;
        }
        .header-info {
          text-align: center;
          color: var(--color-text-secondary);
          font-size: 0.9rem;
          margin-bottom: 2rem;
        }
        .header-info strong {
          color: var(--color-text);
        }
        .character-image {
          display: block;
          margin: 0 auto;
          width: 120px;
          height: 120px;
          border-radius: 50%;
          object-fit: cover;
          background: var(--color-surface-variant);
          border: 3px solid var(--color-accent);
        }
        .messages {
          margin-top: 1rem;
        }
        .message {
          padding: 1rem 0;
          border-bottom: 1px solid var(--color-outline);
          line-height: 1.5;
        }
        .message:last-child {
          border-bottom: none;
        }
        .bot-message {
          border-left: 2px solid var(--color-accent);
          padding-left: 1rem;
        }
        .user-message {
          padding-left: 1rem;
        }
        .message strong {
          display: block;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 0.7rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 0.4rem;
        }
        .user-sender {
          color: var(--color-text-secondary);
        }
        .bot-sender {
          color: var(--color-accent);
        }
        .bot-message .message-text {
          display: block;
          font-family: 'Fraunces', 'Inter', serif;
          font-size: 1.25rem;
          line-height: 1.5;
          color: var(--color-text);
        }
        .user-message .message-text {
          display: block;
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          color: var(--color-text-secondary);
          max-width: 60ch;
        }
        @media print {
          body {
            padding: 0;
          }
          .message {
            break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <h1>Character Chatbot Generator Transcript</h1>
      <div class="header-info">
        <p><strong>Exported:</strong> ${escapeHtml(displayTimestamp)}</p>
      </div>
      ${bot ? `
        <div style="margin-bottom: 2rem;">
          ${isValidAvatarUrl(bot.avatarUrl) ? `<img src="${escapeHtml(bot.avatarUrl)}" alt="${escapeHtml(bot.name)}" class="character-image" />` : ''}
          <h2>${escapeHtml(bot.name)}</h2>
        </div>
      ` : ''}
      <div class="messages">
        ${messages
          .map((msg: { sender: string; text: string }) => {
            const isUser = msg.sender === "User";
            return `
              <div class="message ${isUser ? 'user-message' : 'bot-message'}">
                <strong class="${isUser ? 'user-sender' : 'bot-sender'}">${isUser ? "Me" : (bot ? escapeHtml(bot.name) : escapeHtml(msg.sender))}:</strong>
                <span class="message-text">${sanitizeForDisplay(msg.text)}</span>
              </div>
            `;
          })
          .join('')}
      </div>
    </body>
    </html>
  `;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // CodeQL [js/reflected-xss] - All user inputs are validated and properly HTML-escaped before insertion into the HTML template
  res.status(200).send(htmlTranscript);
  logger.info(`[Transcript API] 200 OK: Transcript sent for display, messages=${messages.length}`);
}

/**
 * Helper function to validate avatar URL format for security.
 *
 * Scheme detection is done on the `scheme:` prefix rather than on `://`, because
 * scheme-only URLs such as `javascript:alert(1)` have no authority component and
 * would otherwise be mistaken for a relative path and rendered as-is.
 */
export function isValidAvatarUrl(url: string): boolean {
  if (typeof url !== 'string' || url === '') return false;
  // Allow absolute paths starting with /
  if (url.startsWith('/')) return true;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(url);
  // Allow relative URLs without a scheme (e.g., 'silhouette.svg')
  if (!hasScheme) return true;
  // Generated avatars are inlined as base64 image data URLs by /api/generate-avatar.
  // SVG is excluded: it is the one image type that can carry markup of its own.
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(url)) return true;
  // For full URLs, validate the protocol is safe
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
