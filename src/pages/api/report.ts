/**
 * "Report a problem": stores a report about a character or one of its replies for admin review
 * in /admin/moderation. Open to guests (the reporter's id is stored only when signed in). The
 * reported character name is trusted only as a label, never looked up or acted on here.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { REPORT_DETAILS_MAX, REPORT_MESSAGE_MAX, isReportReason } from "character-chatbot-shared";
import { getSessionUserId } from "../../utils/account/getSessionUserId";
import { createReport } from "../../utils/moderation/contentReports";
import { createRateLimiter, applyRateLimit } from "../../utils/server/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { withRequestLog } from "../../utils/server/withRequestLog";

/** Rate limiter: 5 reports per minute per IP, so the admin queue can't be flooded. */
const reportRateLimit = createRateLimiter({
  name: "report",
  max: 5,
  message: "Too many reports from this IP, please try again later.",
});

/** Trims a client string to `max` characters; null when absent or blank. */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * Next.js API route handler for submitting a report.
 *
 * @swagger
 * /report:
 *   post:
 *     summary: Report a problem with a character or one of its replies
 *     tags: [Moderation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetType, characterName, reason]
 *             properties:
 *               targetType:
 *                 type: string
 *                 enum: [character, message]
 *               characterName:
 *                 type: string
 *               reason:
 *                 type: string
 *                 enum: [offensive, image, inaccurate, copyright, other]
 *               details:
 *                 type: string
 *                 description: Optional, capped at 500 characters
 *               messageText:
 *                 type: string
 *                 description: The reported reply; required when targetType is message (capped at 1000)
 *     responses:
 *       200:
 *         description: Report stored
 *       400:
 *         description: Invalid report
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Reports aren't being stored (no database or a database failure)
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(reportRateLimit, req, res))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { targetType, characterName, reason, details, messageText } = req.body ?? {};
  // Not sanitizeCharacterName: it strips apostrophes, and an admin acts on this exact name.
  const name = clean(characterName, 100);
  const message = clean(messageText, REPORT_MESSAGE_MAX);
  if (
    (targetType !== "character" && targetType !== "message") ||
    !name ||
    !isReportReason(reason) ||
    (targetType === "message" && !message)
  ) {
    res.status(400).json({ error: "Invalid report" });
    return;
  }

  const stored = await createReport({
    targetType,
    characterName: name,
    messageText: targetType === "message" ? message : null,
    reason,
    details: clean(details, REPORT_DETAILS_MAX),
    reporterUserId: await getSessionUserId(req),
  });
  if (!stored) {
    res.status(503).json({ error: "Reports are unavailable right now" });
    return;
  }
  logEvent(
    "info",
    "content_report_submitted",
    "A report was submitted",
    sanitizeLogMeta({ targetType, characterName: name, reason }),
  );
  res.status(200).json({ ok: true });
}

export default withRequestLog(handler);
