// =============================
// pages/api/transcript.ts
// Next.js API route for generating and returning a downloadable chat transcript.
// Accepts POST requests with messages and returns a text file response.
// =============================

import { NextApiRequest, NextApiResponse } from "next";
import logger from "../../src/utils/logger";

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

  // Expect messages directly from JSON body (sent by downloadTranscript utility)
  const { messages, exportedAt, bot } = req.body;

  if (!Array.isArray(messages)) {
    logger.info(`[Transcript API] 400 Bad Request: Messages array required`);
    logger.error(
      "[Transcript API] Invalid request: Messages array required in JSON body.",
    );
    res.status(400).json({ error: "Messages array required" });
    return;
  }

  logger.info(`[Transcript API] Received messages for download: ${messages.length}`);

  // Generate a simple filename for the download
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `Character Chat Transcript ${datetime}.html`;
  const encodedFilename = encodeURIComponent(filename);

  logger.info(`[Transcript API] Generated download filename: ${filename}`);

  // Generate HTML transcript
  const htmlTranscript = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Character Chat Transcript</title>
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
          <p><strong>Exported:</strong> ${exportedAt || datetime}</p>
          <p><strong>Messages:</strong> ${messages.length}</p>
        </div>
        ${bot ? `
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="${bot.avatarUrl}" alt="${bot.name}" class="character-image" />
            <h2>${bot.name}</h2>
          </div>
        ` : ''}
        <div class="messages">
          ${messages
            .map((msg: { sender: string; text: string }) => {
              const isUser = msg.sender === "User";
              return `
                <div class="message ${isUser ? 'user-message' : 'bot-message'}">
                  <strong class="${isUser ? 'user-sender' : 'bot-sender'}">${isUser ? "Me" : (bot ? bot.name : msg.sender)}:</strong>
                  <span style="margin-left: 8px;">${escapeHtml(msg.text)}</span>
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
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"${filename}\"; filename*=UTF-8''${encodedFilename}`,
  );
  logger.info(`[Transcript API] Set Content-Disposition header for download: attachment; filename=\"${filename}\"; filename*=UTF-8''${encodedFilename}`);
  res.status(200).send(htmlTranscript);
  logger.info(`[Transcript API] 200 OK: Transcript sent for download, messages=${messages.length}`);
}

// Helper for HTML escaping
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, function (tag) {
    const chars: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return chars[tag] || tag;
  });
}
