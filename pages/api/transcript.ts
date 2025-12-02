// =============================
// pages/api/transcript.ts
// Next.js API route for generating and returning a downloadable chat transcript.
// Accepts POST requests with messages (up to 10MB) and returns HTML.
// =============================

import { NextApiRequest, NextApiResponse } from "next";
import logger from "../../src/utils/logger";
import rateLimit from "express-rate-limit";
import { sanitizeForDisplay, escapeHtml } from "../../src/utils/security";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Rate limiter: 10 requests per minute per IP (transcript generation)
const transcriptRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: "Too many transcript requests from this IP, please try again later.",
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

/**
 * Next.js API route handler for generating and downloading chat transcripts.
 * Accepts POST requests with a messages array and returns a text file.
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
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

  // Apply rate limiting
  await new Promise<void>((resolve) => {
    transcriptRateLimit(req, res, () => resolve());
  });
  if (res.headersSent) {
    return;
  }

  // Expect messages directly from JSON body (sent by downloadTranscript utility)
  const { messages, bot, exportedAt } = req.body;

  if (!Array.isArray(messages)) {
    logger.info(`[Transcript API] 400 Bad Request: Messages array required`);
    logger.error(
      "[Transcript API] Invalid request: Messages array required in JSON body.",
    );
    res.status(400).json({ error: "Messages array required" });
    return;
  }

  // Validate inputs
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

  // Validate message count to prevent abuse
  if (messages.length > 10000) {
    logger.info(`[Transcript API] 400 Bad Request: Too many messages (${messages.length})`);
    res.status(400).json({ error: "Too many messages (max 10000)" });
    return;
  }

  // Validate total content size to prevent extremely large payloads
  const totalSize = JSON.stringify(messages).length;
  if (totalSize > 5 * 1024 * 1024) { // 5MB limit
    logger.info(`[Transcript API] 400 Bad Request: Transcript too large (${totalSize} bytes)`);
    res.status(400).json({ error: "Transcript too large (max 5MB)" });
    return;
  }

  logger.info(`[Transcript API] Received messages for download: ${messages.length}`);

  // Use the friendly exportedAt timestamp if provided, otherwise generate a machine-readable one
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

  // Generate filename for the HTML document title
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `Character Chat Transcript ${datetime}.html`;

  logger.info(`[Transcript API] Generated filename: ${filename}`);

  // Generate HTML transcript
  const htmlTranscript = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${filename}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #fafafa;
        }
        .container {
          background-color: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
          text-align: center;
          margin-bottom: 10px;
        }
        h2 {
          color: #555;
          text-align: center;
          margin-top: 10px;
        }
        .header-info {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
        }
        .character-image {
          display: block;
          margin: 20px auto;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #ccc;
        }
        .message {
          margin-bottom: 15px;
          padding: 15px;
          border-radius: 8px;
          line-height: 1.4;
        }
        .user-message {
          background-color: #e3f2fd;
          border-left: 4px solid #1976d2;
        }
        .bot-message {
          background-color: #f3e5f5;
          border-left: 4px solid #7b1fa2;
        }
        .message strong {
          font-weight: 600;
        }
        .user-sender {
          color: #1976d2;
        }
        .bot-sender {
          color: #7b1fa2;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Character Chatbot Generator Transcript</h1>
        <div class="header-info">
          <p><strong>Exported:</strong> ${escapeHtml(displayTimestamp)}</p>
        </div>
        ${bot ? `
          <div style="text-align: center; margin-bottom: 30px;">
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
                  <span style="margin-left: 8px;">${sanitizeForDisplay(msg.text)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    </body>
    </html>
  `;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // CodeQL [js/reflected-xss] - All user inputs are validated and properly HTML-escaped before insertion into the HTML template
  res.status(200).send(htmlTranscript);
  logger.info(`[Transcript API] 200 OK: Transcript sent for display, messages=${messages.length}`);
}

// Helper for validating avatar URL
export function isValidAvatarUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  // Allow relative URLs or absolute paths starting with /
  if (url.startsWith('/')) return true;
  // Allow relative URLs without / (like 'silhouette.svg')
  if (!url.includes('://')) return true;
  // For full URLs, check protocol
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
