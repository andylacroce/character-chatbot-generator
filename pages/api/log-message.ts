import { NextApiRequest, NextApiResponse } from "next";
import { put, head } from "@vercel/blob";
import fs from "fs";
import path from "path";
import logger from "../../src/utils/logger";

/**
 * Escapes HTML special characters to prevent XSS in logs.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(str: string): string {
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

/**
 * Checks if an IP is a valid public IPv4 or IPv6 address.
 * @param {string} ip - The IP address to check.
 * @returns {boolean} True if the IP is public.
 */
function isValidPublicIp(ip: string): boolean {
  // Remove port if present (only for IPv4)
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.split(":")[0];
  }
  // IPv4 regex
  const ipv4 =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6 regex (permissive, matches :: and full addresses)
  const ipv6 = /^([\da-fA-F]{1,4}:){1,7}[\da-fA-F]{1,4}$|^::1$|^::$|^([\da-fA-F]{1,4}:){1,7}:$/;
  // Private IPv4 ranges
  const privateRanges = [
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
  ];
  if (ipv4.test(ip)) {
    if (privateRanges.some((r) => r.test(ip))) return false;
    return true;
  }
  if (ipv6.test(ip)) {
    // Exclude loopback and link-local
    if (ip === "::1" || ip.startsWith("fe80:")) return false;
    return true;
  }
  return false;
}

/**
 * Next.js API route handler for logging chat messages.
 * Accepts POST requests with sender, text, sessionId, and sessionDatetime.
 * Logs messages to Vercel Blob or local file system.
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(
  req: import("next").NextApiRequest,
  res: import("next").NextApiResponse,
) {
  if (req.method !== "POST") {
    logger.info(`[Log API] 405 Method Not Allowed for ${req.method}`);
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { sender, text, sessionId, sessionDatetime } = req.body;
    if (
      !sender ||
      typeof text === "undefined" ||
      !sessionId ||
      !sessionDatetime
    ) {
      logger.info(`[Log API] 400 Bad Request: Missing required fields`);
      return res
        .status(400)
        .json({
          error: "Sender, text, sessionId, and sessionDatetime required",
        });
    }

    // Validate input types and lengths BEFORE sanitizing
    if (typeof sender !== "string" || sender.length > 100) {
      logger.info(`[Log API] 400 Bad Request: Invalid sender`);
      return res.status(400).json({ error: "Invalid sender" });
    }
    if (typeof text !== "string" || text.length > 2000) {
      logger.info(`[Log API] 400 Bad Request: Invalid text`);
      return res.status(400).json({ error: "Invalid text" });
    }
    if (typeof sessionId !== "string" || sessionId.length > 100) {
      logger.info(`[Log API] 400 Bad Request: Invalid sessionId`);
      return res.status(400).json({ error: "Invalid sessionId" });
    }
    if (typeof sessionDatetime !== "string" || sessionDatetime.length > 30) {
      logger.info(`[Log API] 400 Bad Request: Invalid sessionDatetime`);
      return res.status(400).json({ error: "Invalid sessionDatetime" });
    }

    // Sanitize sender and text to prevent XSS in logs
    const safeSender = escapeHtml(sender);
    const safeText = escapeHtml(text);

    // Prevent log injection by removing newlines and control characters
    const cleanSender = safeSender.replace(/[\r\n\t\0\x0B\f]/g, "");
    const cleanText = safeText.replace(/[\r\n\t\0\x0B\f]/g, "");

    // --- Get IP (no geolocation for security) ---
    const ip =
      (
        (req.headers["x-forwarded-for"] as string) ||
        req.socket.remoteAddress ||
        ""
      )
        .split(",")[0]
        .trim() || "UnknownIP";
    const safeIp = ip.replace(/[^a-zA-Z0-9\.:_-]/g, ""); // Basic sanitization
    // --- End IP ---

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${safeIp}] ${cleanSender}: ${cleanText}\n`;

    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // --- Determine Log Filename ---
    // Sanitize filename to prevent directory traversal
    const safeSessionDatetime = sessionDatetime.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeShortSessionId = sessionId
      .slice(0, 8)
      .replace(/[^a-zA-Z0-9]/g, "");
    let logFilename: string = `${safeSessionDatetime}_session_${safeShortSessionId}.log`;
    // --- End Determine Log Filename ---

    // --- Append to Log ---
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Append to Vercel Blob (Read, Append, Write)
      try {
        let existingContent = "";
        try {
          // Check if blob exists and get its content
          const blobInfo = await head(logFilename); // Check if file exists
          if (blobInfo && blobInfo.url) {
            const response = await fetch(
              blobInfo.url + `?cachebust=${Date.now()}`,
            ); // Bypass CDN cache
            if (response.ok) {
              existingContent = await response.text();
            }
          }
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            (error as any).status !== 404
          ) {
            // Ignore non-404 errors
          }
        }

        const newContent = existingContent + logEntry;

        // Write the log content directly (no explicit UTF-8 conversion)
        await put(logFilename, newContent, {
          access: "public", // Or 'private'
          allowOverwrite: true, // Allow overwriting the existing blob
        });
      } catch (error) {
        logger.error("[Log API] Error appending to Vercel Blob:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    } else {
      // Append to local file
      try {
        const logDir = path.resolve(process.cwd(), "tmp", "logs");
        const filePath = path.join(logDir, logFilename);

        // Validate that filePath is within logDir to prevent path traversal
        const resolvedFilePath = path.resolve(filePath);
        const rel = path.relative(logDir, resolvedFilePath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error("Invalid log file path");
        }

        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(resolvedFilePath, logEntry, "utf8");
      } catch (error) {
        logger.error("[Log API] Error appending to local file:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }
    // --- End Append to Log ---

    // Always log to the main terminal (stdout) as well
    logger.info(`[Log API] ENTRY: ${logEntry.trim()}`);

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("[Log API] Internal Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
    logger.info(`[Log API] 500 Internal Server Error`);
  }
}

export { escapeHtml, isValidPublicIp };
