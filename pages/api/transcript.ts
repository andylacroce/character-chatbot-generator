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
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Expect messages directly from JSON body (sent by downloadTranscript utility)
  const { messages, exportedAt } = req.body;

  if (!Array.isArray(messages)) {
    logger.info(`[Transcript API] 400 Bad Request: Messages array required`);
    logger.error(
      "[Transcript API] Invalid request: Messages array required in JSON body.",
    );
    return res.status(400).json({ error: "Messages array required" });
  }

  logger.info(`[Transcript API] Received messages for download: ${messages.length}`);

  // Generate a simple filename for the download
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `Character Chat Transcript ${datetime}.txt`;
  const encodedFilename = encodeURIComponent(filename);

  logger.info(`[Transcript API] Generated download filename: ${filename}`);

  // Add a header with chat details, including local export time
  const header = `Character Chatbot Generator Transcript\nExported: ${exportedAt || datetime}\nMessages: ${messages.length}\n`;
  const separator = '\n' + '-'.repeat(40) + '\n';
  const transcriptBody = messages
    .map(
      (msg: { sender: string; text: string }) =>
        `${msg.sender === "User" ? "Me" : msg.sender}: ${msg.text}`,
    )
    .join(separator);
  const transcript = `${header}${separator}${transcriptBody}`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"${filename}\"; filename*=UTF-8''${encodedFilename}`,
  );
  logger.info(`[Transcript API] Set Content-Disposition header for download: attachment; filename=\"${filename}\"; filename*=UTF-8''${encodedFilename}`);
  res.status(200).send(transcript);
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
