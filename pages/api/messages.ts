/**
 * API endpoint for a signed-in user's persisted chat history for one saved character.
 * Guests, no DATABASE_URL, or a character the user never saved server-side (e.g. a
 * copyright-warning override, which is never persisted at all) all get an empty list, not
 * an error — accounts are additive, and nothing here should ever be reachable in a way that
 * breaks the guest, localStorage-only flow. GET-only: messages are written server-side as a
 * side effect of a real chat turn (see pages/api/chat.ts), never through a directly-callable
 * write endpoint.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { bots, messages } from "../../src/db/schema";
import { getSessionUserId } from "../../src/utils/getSessionUserId";
import { sanitizeCharacterName } from "../../src/utils/security";
import { createRateLimiter, applyRateLimit } from "../../src/utils/rateLimit";
import { getCurrentEnvironment } from "../../src/utils/environment";
import logger from "../../src/utils/logger";

/** Rate limiter: 30 requests per minute per IP. */
const messagesRateLimit = createRateLimiter({
  name: "messages",
  max: 30,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for listing a signed-in user's chat history for one character.
 *
 * @swagger
 * /messages:
 *   get:
 *     summary: List a signed-in user's persisted chat history for one saved character
 *     description: >
 *       Guests, deployments with no DATABASE_URL configured, or a character name that
 *       doesn't match one of this user's saved characters (including a copyright-warning
 *       override, which is never saved) all get an empty list, not an error. Oldest first,
 *       capped at the 200 most recent messages.
 *     tags: [Chat]
 *     parameters:
 *       - in: query
 *         name: botName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The character's chat history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sender:
 *                         type: string
 *                       text:
 *                         type: string
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to list messages
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(messagesRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const userId = await getSessionUserId(req, res);
  const botName = typeof req.query.botName === "string" ? req.query.botName : "";
  const sanitizedName = sanitizeCharacterName(botName);
  if (!userId || !sanitizedName || !process.env.DATABASE_URL) {
    res.status(200).json({ messages: [] });
    return;
  }

  const db = getDb();

  try {
    const [botRow] = await db
      .select()
      .from(bots)
      .where(and(
        eq(bots.userId, userId),
        eq(bots.name, sanitizedName),
        eq(bots.environment, getCurrentEnvironment()),
      ));
    if (!botRow) {
      res.status(200).json({ messages: [] });
      return;
    }

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.botId, botRow.id))
      .orderBy(desc(messages.id))
      .limit(200);

    res.status(200).json({
      messages: rows.reverse().map((m) => ({ sender: m.sender, text: m.text })),
    });
  } catch (err) {
    logger.error("Failed to list messages:", { error: err });
    res.status(500).json({ error: "Failed to list messages" });
  }
}
