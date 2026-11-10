/**
 * API endpoint for a signed-in user's persisted characters ("bots").
 * Guests get a graceful no-op on every method — accounts are additive, and nothing
 * here should ever be reachable in a way that breaks the guest, localStorage-only flow.
 */

import type { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db/client";
import { bots } from "../../../db/schema";
import { getSessionUserId } from "../../../utils/account/getSessionUserId";
import { deleteUserBlobs, isBlobAvatarUrl, isBlobHostUrl } from "../../../utils/account/userBlobs";
import { sanitizeCharacterName } from "../../../utils/server/security";
import { getCurrentEnvironment } from "../../../utils/environment";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRoute, readJson } from "../../../utils/server/withRoute";

const LIMIT = {
  name: "bots",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

/** Resolves the caller's id, or null (guest, or no DATABASE_URL) which every method treats as a no-op. */
async function persistedUserId(req: NextRequest): Promise<string | null> {
  const userId = await getSessionUserId(req);
  return userId && process.env.DATABASE_URL ? userId : null;
}

/**
 * Lists, saves and deletes a signed-in user's characters.
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
 *         description: Invalid name, personality or avatar
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
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to list characters
 *   delete:
 *     summary: Delete one saved character, or clear the signed-in user's chat history
 *     description: >
 *       With `id`, deletes that one saved character (if it's the caller's) with its
 *       messages and private portrait. Without it, deletes every saved character in the
 *       current environment along with their messages, private portraits, and the user's
 *       chat logs. Guests and deployments with no DATABASE_URL get `{ cleared: 0 }`.
 *     tags: [Bots]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Number of characters removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cleared:
 *                   type: integer
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to clear chat history
 */
export const GET = withRoute(LIMIT, async (req: NextRequest) => {
  const userId = await persistedUserId(req);
  if (!userId) return Response.json({ bots: [] });
  try {
    const rows = await getDb()
      .select()
      .from(bots)
      .where(and(eq(bots.userId, userId), eq(bots.environment, getCurrentEnvironment())))
      .orderBy(desc(bots.updatedAt))
      .limit(50);
    return Response.json({ bots: rows });
  } catch (err) {
    logEvent(
      "error",
      "bots_list_failed",
      "Failed to list bots",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return Response.json({ error: "Failed to list characters" }, { status: 500 });
  }
});

/** DELETE: one saved chat by `?id=`, or (no id) every saved chat. */
export const DELETE = withRoute(LIMIT, async (req: NextRequest) => {
  const userId = await persistedUserId(req);
  if (!userId) return Response.json({ cleared: 0 });
  const id = req.nextUrl.searchParams.get("id");
  let deleted: { avatarUrl: string | null }[];
  try {
    // Cascades to `messages` via its FK to bots.id.
    deleted = await getDb()
      .delete(bots)
      .where(
        and(
          eq(bots.userId, userId),
          eq(bots.environment, getCurrentEnvironment()),
          id ? eq(bots.id, id) : undefined,
        ),
      )
      .returning({ avatarUrl: bots.avatarUrl });
  } catch (err) {
    logEvent(
      "error",
      "bots_clear_failed",
      "Failed to clear chat history",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return Response.json({ error: "Failed to clear chat history" }, { status: 500 });
  }
  // History is already gone; a leftover blob is logged for manual cleanup, not a failure.
  try {
    await deleteUserBlobs(
      userId,
      deleted.map((row) => row.avatarUrl),
      { chatLogs: !id },
    );
  } catch (err) {
    logEvent(
      "error",
      "bots_clear_blob_failed",
      "Chat history cleared but its avatar images or chat logs could not be removed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
  logEvent("info", id ? "bots_deleted" : "bots_cleared", "Saved chats deleted", {
    count: deleted.length,
  });
  return Response.json({ cleared: deleted.length });
});

/** POST: create or update the signed-in user's saved character. */
export const POST = withRoute(LIMIT, async (req: NextRequest) => {
  const userId = await persistedUserId(req);
  if (!userId) return Response.json({ persisted: false });
  const { name, personality, avatarUrl, gender, voiceConfig } = await readJson(req);
  const sanitizedName = sanitizeCharacterName(name);
  if (!sanitizedName || typeof personality !== "string" || !personality.trim()) {
    return Response.json({ error: "Invalid name or personality" }, { status: 400 });
  }

  // A blob URL must be one of this app's portraits: deleting a saved character deletes its
  // unreferenced blob, so storing another blob's URL (e.g. a chat log) would let it be deleted.
  if (
    avatarUrl != null &&
    (typeof avatarUrl !== "string" || (isBlobHostUrl(avatarUrl) && !isBlobAvatarUrl(avatarUrl)))
  ) {
    return Response.json({ error: "Invalid avatar" }, { status: 400 });
  }

  try {
    await getDb()
      .insert(bots)
      .values({
        userId,
        name: sanitizedName,
        personality,
        avatarUrl: avatarUrl ?? null,
        gender: gender ?? null,
        voiceConfig: voiceConfig ?? null,
        environment: getCurrentEnvironment(),
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
    return Response.json({ persisted: true });
  } catch (err) {
    logEvent(
      "error",
      "bots_persist_failed",
      "Failed to persist bot",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return Response.json({ error: "Failed to save character" }, { status: 500 });
  }
});
