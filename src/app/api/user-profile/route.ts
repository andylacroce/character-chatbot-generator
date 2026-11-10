/**
 * API endpoint for a signed-in user's own preferred name — what a character should call
 * them, distinct from the OAuth-sourced `users.name` (see src/db/schema.ts). Guests get a
 * graceful no-op on every method, same as app/api/bots/route.ts — this is additive and must
 * never break the localStorage-only guest flow.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client";
import { users } from "../../../db/schema";
import { getSessionUserId } from "../../../utils/account/getSessionUserId";
import { sanitizeUserName } from "../../../utils/server/security";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRoute } from "../../../utils/server/withRoute";

/** Resolves the caller's id, or null (guest, or no DATABASE_URL) which every method treats as a no-op. */
async function persistedUserId(req: NextRequest): Promise<string | null> {
  const userId = await getSessionUserId(req);
  return userId && process.env.DATABASE_URL ? userId : null;
}

const LIMIT = {
  name: "user-profile",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

/**
 * Route handler (20 requests per minute per IP) for reading and updating a signed-in user's preferred name.
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
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to save preferred name
 */
export const GET = withRoute(LIMIT, async (req: NextRequest) => {
  const userId = await persistedUserId(req);
  if (!userId) return Response.json({ name: null });
  try {
    const rows = await getDb()
      .select({ preferredName: users.preferredName })
      .from(users)
      .where(eq(users.id, userId));
    return Response.json({ name: rows[0]?.preferredName ?? null });
  } catch (err) {
    logEvent(
      "error",
      "user_profile_get_failed",
      "Failed to load preferred name",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return Response.json({ error: "Failed to load preferred name" }, { status: 500 });
  }
});

/** POST: set (or, with an empty string, clear) the signed-in user's preferred name. */
export const POST = withRoute(LIMIT, async (req: NextRequest) => {
  const userId = await persistedUserId(req);
  if (!userId) return Response.json({ persisted: false });
  const { name } = (await req.json().catch(() => null)) ?? {};
  if (typeof name !== "string") return Response.json({ error: "Invalid name" }, { status: 400 });
  try {
    await getDb()
      .update(users)
      .set({ preferredName: sanitizeUserName(name) || null })
      .where(eq(users.id, userId));
    return Response.json({ persisted: true });
  } catch (err) {
    logEvent(
      "error",
      "user_profile_update_failed",
      "Failed to save preferred name",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return Response.json({ error: "Failed to save preferred name" }, { status: 500 });
  }
});
