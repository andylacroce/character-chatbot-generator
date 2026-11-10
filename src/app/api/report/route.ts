/**
 * "Report a problem": stores a report about a character or one of its replies for admin review
 * in /admin/moderation. Open to guests (the reporter's id is stored only when signed in). The
 * reported character name is trusted only as a label, never looked up or acted on here.
 */

import type { NextRequest } from "next/server";
import {
  REPORT_DETAILS_MAX,
  REPORT_MESSAGE_MAX,
  isReportReason,
} from "character-chatbot-shared/src/core";
import { getSessionUserId } from "../../../utils/account/getSessionUserId";
import { createReport } from "../../../utils/moderation/contentReports";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRoute } from "../../../utils/server/withRoute";

/** Trims a client string to `max` characters; null when absent or blank. */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * Route handler for submitting a report (5 per minute per IP, so the admin queue can't be flooded).
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
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Reports aren't being stored (no database or a database failure)
 */
export const POST = withRoute(
  {
    name: "report",
    max: 5,
    message: "Too many reports from this IP, please try again later.",
  },
  async (req: NextRequest) => {
    const body = (await req.json().catch(() => null)) ?? {};
    const { targetType, characterName, reason, details, messageText } = body;
    // Not sanitizeCharacterName: it strips apostrophes, and an admin acts on this exact name.
    const name = clean(characterName, 100);
    const message = clean(messageText, REPORT_MESSAGE_MAX);
    if (
      (targetType !== "character" && targetType !== "message") ||
      !name ||
      !isReportReason(reason) ||
      (targetType === "message" && !message)
    ) {
      return Response.json({ error: "Invalid report" }, { status: 400 });
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
      return Response.json({ error: "Reports are unavailable right now" }, { status: 503 });
    }
    logEvent(
      "info",
      "content_report_submitted",
      "A report was submitted",
      sanitizeLogMeta({ targetType, characterName: name, reason }),
    );
    return Response.json({ ok: true });
  },
);
