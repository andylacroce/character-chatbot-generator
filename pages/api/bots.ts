/**
 * API endpoint for a signed-in user's persisted characters ("bots").
 * Guests get a graceful no-op on every method — accounts are additive, and nothing
 * here should ever be reachable in a way that breaks the guest, localStorage-only flow.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { bots } from "../../src/db/schema";
import { getSessionUserId } from "../../src/utils/getSessionUserId";
import { sanitizeCharacterName } from "../../src/utils/security";
import { createRateLimiter } from "../../src/utils/rateLimit";
import { getCurrentEnvironment } from "../../src/utils/environment";
import logger from "../../src/utils/logger";

/** Rate limiter: 20 requests per minute per IP. */
const botsRateLimit = createRateLimiter({
  name: "bots",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for persisting and listing a signed-in user's characters.
 *
 * @swagger
 * /bots:
 *   post:
 *     summary: Persist a created character for the signed-in user
 *     description: >
 *       Upserts on (user_id, name) — recreating a same-named character updates the
 *       existing row rather than erroring. Guests (no session) and deployments with
 *       no DATABASE_URL configured get a 200 no-op, not an error, matching the rest
 *       of this app's degrade-gracefully pattern for optional account persistence.
 *     tags: [Bots]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, personality]
 *             properties:
 *               name:
 *                 type: string
 *               personality:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *                 nullable: true
 *               gender:
 *                 type: string
 *                 nullable: true
 *               voiceConfig:
 *                 type: object
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Persisted (or a guest/no-DB no-op)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 persisted:
 *                   type: boolean
 *       400:
 *         description: Invalid name or personality
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to save character
 *   get:
 *     summary: List the signed-in user's persisted characters, most recently updated first
 *     description: >
 *       Guests and deployments with no DATABASE_URL get an empty list, not an error.
 *       Capped at the 50 most recently updated characters.
 *     tags: [Bots]
 *     responses:
 *       200:
 *         description: The user's characters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bots:
 *                   type: array
 *                   items:
 *                     type: object
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to list characters
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await new Promise<void>((resolve) => {
    botsRateLimit(req, res, () => resolve());
  });
  if (res.headersSent) return;

  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const userId = await getSessionUserId(req, res);
  if (!userId || !process.env.DATABASE_URL) {
    res.status(200).json(req.method === "GET" ? { bots: [] } : { persisted: false });
    return;
  }

  const db = getDb();
  const environment = getCurrentEnvironment();

  if (req.method === "GET") {
    try {
      const rows = await db
        .select()
        .from(bots)
        .where(and(eq(bots.userId, userId), eq(bots.environment, environment)))
        .orderBy(desc(bots.updatedAt))
        .limit(50);
      res.status(200).json({ bots: rows });
    } catch (err) {
      logger.error("Failed to list bots:", { error: err });
      res.status(500).json({ error: "Failed to list characters" });
    }
    return;
  }

  const { name, personality, avatarUrl, gender, voiceConfig } = req.body;
  const sanitizedName = sanitizeCharacterName(name);
  if (!sanitizedName || typeof personality !== "string" || !personality.trim()) {
    res.status(400).json({ error: "Invalid name or personality" });
    return;
  }

  try {
    await db
      .insert(bots)
      .values({
        userId,
        name: sanitizedName,
        personality,
        avatarUrl: avatarUrl ?? null,
        gender: gender ?? null,
        voiceConfig: voiceConfig ?? null,
        environment,
      })
      .onConflictDoUpdate({
        target: [bots.userId, bots.name, bots.environment],
        set: {
          personality,
          avatarUrl: avatarUrl ?? null,
          gender: gender ?? null,
          voiceConfig: voiceConfig ?? null,
          updatedAt: new Date(),
        },
      });
    res.status(200).json({ persisted: true });
  } catch (err) {
    logger.error("Failed to persist bot:", { error: err });
    res.status(500).json({ error: "Failed to save character" });
  }
}
