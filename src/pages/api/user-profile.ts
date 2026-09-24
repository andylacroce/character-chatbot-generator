/**
 * API endpoint for a signed-in user's own preferred name — what a character should call
 * them, distinct from the OAuth-sourced `users.name` (see src/db/schema.ts). Guests get a
 * graceful no-op on every method, same as pages/api/bots.ts — this is additive and must
 * never break the localStorage-only guest flow.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { users } from "../../db/schema";
import { getSessionUserId } from "../../utils/getSessionUserId";
import { sanitizeUserName } from "../../utils/security";
import { createRateLimiter, applyRateLimit } from "../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { withRequestLog } from "../../utils/withRequestLog";

/** Rate limiter: 20 requests per minute per IP. */
const userProfileRateLimit = createRateLimiter({
  name: "user-profile",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for reading and updating a signed-in user's preferred name.
 *
 * @swagger
 * /user-profile:
 *   get:
 *     summary: Get the signed-in user's preferred name
 *     description: >
 *       Guests (no session) and deployments with no DATABASE_URL configured get
 *       `{ name: null }`, not an error, matching this app's degrade-gracefully pattern
 *       for optional account persistence.
 *     tags: [UserProfile]
 *     responses:
 *       200:
 *         description: The user's preferred name, or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   nullable: true
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to load preferred name
 *   post:
 *     summary: Set the signed-in user's preferred name
 *     description: >
 *       An empty string clears the stored name. Guests and deployments with no
 *       DATABASE_URL configured get a 200 no-op, not an error.
 *     tags: [UserProfile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
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
 *         description: Invalid name
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to save preferred name
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(userProfileRateLimit, req, res))) return;

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const userId = await getSessionUserId(req);
  if (!userId || !process.env.DATABASE_URL) {
    res.status(200).json(req.method === "GET" ? { name: null } : { persisted: false });
    return;
  }

  const db = getDb();

  if (req.method === "GET") {
    try {
      const rows = await db
        .select({ preferredName: users.preferredName })
        .from(users)
        .where(eq(users.id, userId));
      res.status(200).json({ name: rows[0]?.preferredName ?? null });
    } catch (err) {
      logEvent(
        "error",
        "user_profile_get_failed",
        "Failed to load preferred name",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      res.status(500).json({ error: "Failed to load preferred name" });
    }
    return;
  }

  const { name } = req.body;
  if (typeof name !== "string") {
    res.status(400).json({ error: "Invalid name" });
    return;
  }
  const sanitizedName = sanitizeUserName(name);

  try {
    await db
      .update(users)
      .set({ preferredName: sanitizedName || null })
      .where(eq(users.id, userId));
    res.status(200).json({ persisted: true });
  } catch (err) {
    logEvent(
      "error",
      "user_profile_update_failed",
      "Failed to save preferred name",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to save preferred name" });
  }
}

export default withRequestLog(handler);
