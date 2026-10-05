/**
 * API endpoint for logging chat messages and events.
 * Stores logs using Vercel Blob or local file storage with XSS-safe HTML escaping. A
 * signed-in user's logs go under their per-account prefix (utils/userBlobs.ts) so
 * pages/api/account.ts can delete them with the account.
 */

import { BlobNotFoundError, head, put } from "@vercel/blob";
import fs from "fs";
import path from "path";
import { generateRequestId, logEvent, sanitizeLogMeta } from "../../utils/logger";
import { escapeHtml } from "../../utils/security";
import { chatLogPrefix } from "../../utils/userBlobs";
import { getSessionUserId } from "../../utils/getSessionUserId";
import { withRequestLog } from "../../utils/withRequestLog";
import { createRateLimiter, applyRateLimit } from "../../utils/rateLimit";

/** Rate limiter: 60 requests per minute per IP (two log lines per chat turn, which is itself capped). */
const logRateLimit = createRateLimiter({
  name: "log-message",
  max: 60,
  message: "Too many log requests from this IP, please try again later.",
});

/** Per-log append chains, so concurrent appends from one instance don't overwrite each other. */
const blobAppendQueues = new Map<string, Promise<unknown>>();

/**
 * Read-modify-write append to a blob log. The write replaces the whole blob, so a read
 * that fails for any reason other than "no such blob yet" must abort rather than write:
 * proceeding would silently replace the existing log with this one line. Appends to the
 * same log within an instance are serialized (instances can still race; blobs have no
 * atomic append).
 */
function appendToBlobLog(filename: string, entry: string, token: string): Promise<void> {
  const run = async () => {
    let existing = "";
    try {
      const info = await head(filename, { token });
      const response = await fetch((info.downloadUrl || info.url) + `?cachebust=${Date.now()}`); // Bypass CDN cache
      if (!response.ok) throw new Error(`Reading the existing log failed (${response.status})`);
      existing = await response.text();
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) throw error;
    }
    await put(filename, existing + entry, {
      access: "public",
      allowOverwrite: true, // Replaces the log with the appended contents
      addRandomSuffix: false, // Keep deterministic filename
      token,
    });
  };
  const next = (blobAppendQueues.get(filename) ?? Promise.resolve()).then(run, run);
  const tail = next.catch(() => undefined);
  blobAppendQueues.set(filename, tail);
  void tail.then(() => {
    if (blobAppendQueues.get(filename) === tail) blobAppendQueues.delete(filename);
  });
  return next;
}

/**
 * Next.js API route handler for logging chat messages and events to storage (Vercel Blob or local).
 * Includes XSS-safe HTML escaping for logs.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 *
 * @swagger
 * /log-message:
 *   post:
 *     summary: Log a chat message or event
 *     description: >
 *       Stores an HTML-escaped, control-character-stripped log line via Vercel Blob
 *       (if VERCEL_BLOB_READ_WRITE_TOKEN is set) or a local file under tmp/logs.
 *     tags: [Logging]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sender, text, sessionId, sessionDatetime]
 *             properties:
 *               sender:
 *                 type: string
 *                 maxLength: 100
 *               text:
 *                 type: string
 *                 maxLength: 2000
 *               sessionId:
 *                 type: string
 *                 maxLength: 100
 *               sessionDatetime:
 *                 type: string
 *                 maxLength: 30
 *     responses:
 *       200:
 *         description: Logged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 requestId:
 *                   type: string
 *       400:
 *         description: Missing or invalid fields
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */
async function handler(req: import("next").NextApiRequest, res: import("next").NextApiResponse) {
  const requestId = req.headers["x-request-id"] || generateRequestId();

  if (!(await applyRateLimit(logRateLimit, req, res))) return;

  if (req.method !== "POST") {
    logEvent(
      "warn",
      "log_api_method_not_allowed",
      "Method not allowed",
      sanitizeLogMeta({
        method: req.method,
        requestId,
      }),
    );
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  try {
    const { sender, text, sessionId, sessionDatetime } = req.body;
    if (!sender || typeof text === "undefined" || !sessionId || !sessionDatetime) {
      logEvent(
        "warn",
        "log_api_missing_fields",
        "Missing required fields",
        sanitizeLogMeta({
          requestId,
        }),
      );
      res.status(400).json({
        error: "Sender, text, sessionId, and sessionDatetime required",
        requestId,
      });
      return;
    }

    // Validate input types and lengths BEFORE any transformations
    if (typeof sender !== "string" || sender.length > 100) {
      logEvent(
        "warn",
        "log_api_invalid_sender",
        "Invalid sender",
        sanitizeLogMeta({
          sender,
          requestId,
        }),
      );
      res.status(400).json({ error: "Invalid sender", requestId });
      return;
    }
    if (typeof text !== "string" || text.length > 2000) {
      logEvent(
        "warn",
        "log_api_invalid_text",
        "Invalid text",
        sanitizeLogMeta({
          textLength: typeof text === "string" ? text.length : undefined,
          requestId,
        }),
      );
      res.status(400).json({ error: "Invalid text", requestId });
      return;
    }
    if (typeof sessionId !== "string" || sessionId.length > 100) {
      logEvent(
        "warn",
        "log_api_invalid_sessionId",
        "Invalid sessionId",
        sanitizeLogMeta({
          sessionId,
          requestId,
        }),
      );
      res.status(400).json({ error: "Invalid sessionId", requestId });
      return;
    }
    if (typeof sessionDatetime !== "string" || sessionDatetime.length > 30) {
      logEvent(
        "warn",
        "log_api_invalid_sessionDatetime",
        "Invalid sessionDatetime",
        sanitizeLogMeta({
          sessionDatetime,
          requestId,
        }),
      );
      res.status(400).json({ error: "Invalid sessionDatetime", requestId });
      return;
    }

    // Sanitize sender and text to prevent XSS in stored logs
    const safeSender = escapeHtml(sender);
    const safeText = escapeHtml(text);

    // Remove newlines and control characters to prevent log injection
    const cleanSender = safeSender.replace(/[\r\n\t\0\x0B\f]/g, "");
    const cleanText = safeText.replace(/[\r\n\t\0\x0B\f]/g, "");

    const timestamp = new Date().toISOString();
    // Deliberately no IP address: an IP would tie a guest's otherwise-anonymous log to a
    // real person, which the privacy policy promises not to do.
    const logEntry = `[${timestamp}] ${cleanSender}: ${cleanText}\n`;

    // --- Determine Log Filename ---
    // Sanitize filename to prevent directory traversal
    const safeSessionDatetime = sessionDatetime.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeShortSessionId = sessionId.slice(0, 8).replace(/[^a-zA-Z0-9]/g, "");
    const logFilename: string = `${chatLogPrefix(await getSessionUserId(req))}${safeSessionDatetime}_session_${safeShortSessionId}.log`;
    // --- End Determine Log Filename ---

    // --- Append to Log ---
    const blobToken = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

    if (blobToken) {
      // Append to Vercel Blob (Read, Append, Write)
      try {
        await appendToBlobLog(logFilename, logEntry, blobToken);
      } catch (error) {
        logEvent(
          "error",
          "log_api_blob_write_failed",
          "Error appending to Vercel Blob",
          sanitizeLogMeta({
            requestId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }
    } else {
      // Append to local file
      try {
        const logDir = path.resolve(process.cwd(), "tmp", "logs");
        const filePath = path.join(logDir, logFilename);

        // Validate that filePath is within logDir to prevent path traversal
        const resolvedFilePath = path.resolve(filePath);
        const rel = path.relative(logDir, resolvedFilePath);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          throw new Error("Invalid log file path");
        }

        fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
        fs.appendFileSync(resolvedFilePath, logEntry, "utf8");
      } catch (error) {
        logEvent(
          "error",
          "log_api_file_write_failed",
          "Error appending to local file",
          sanitizeLogMeta({
            requestId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }
    }
    // --- End Append to Log ---

    // Always log to the main terminal (stdout) as well
    logEvent(
      "info",
      "log_api_entry",
      "Log entry",
      sanitizeLogMeta({
        requestId,
        timestamp,
        sender: cleanSender,
        sessionId,
        sessionDatetime,
        text: cleanText,
      }),
    );
    res.status(200).json({ success: true, requestId });
    return;
  } catch (error) {
    logEvent(
      "error",
      "log_api_internal_error",
      "Internal Server Error",
      sanitizeLogMeta({
        requestId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    res.status(500).json({ error: "Internal Server Error", requestId });
  }
}

export default withRequestLog(handler);
