/**
 * Admin-only control of a character's shared `avatar_cache` row. PATCH moves it to another Wall
 * category. For a bad image, DELETE purges the portrait (the next creation of that name builds a fresh one); POST regenerates it
 * now, swapping the new image in place. Both leave users' saved characters, the blocklist, and
 * the allowlist alone (blocking a name is the separate /admin/blocklist action), and both clear
 * the Wall's per-instance list cache so a stale tile doesn't point at a deleted image.
 */

import { adminRoute, readAdminName } from "../../../../utils/account/adminGuard";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";
import { isCharacterCategory } from "character-chatbot-shared/src/core";
import {
  purgeCachedAvatar,
  regenerateCachedAvatar,
  setCachedCategory,
} from "../../../../utils/avatar/avatarGeneration";
import { clearCharactersCache } from "../../../../utils/moderation/charactersWall";
import { readJson } from "../../../../utils/server/withRoute";

const LIMIT = {
  name: "admin-characters",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

/**
 * Next.js API route handler for purging or regenerating a character's cached portrait.
 *
 * @swagger
 * /admin/characters:
 *   post:
 *     summary: Regenerate a character's cached portrait now (admin-only; one image generation)
 *     tags: [Admin]
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
 *         description: Regenerated; `avatarUrl` is the new portrait
 *       400:
 *         description: Valid name required
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *       502:
 *         description: No image provider produced a portrait; the old one is unchanged
 *   patch:
 *     summary: Move a character to another Wall category (admin-only)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category]
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [history, mythology, literature, folklore, religion]
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Valid name and category required
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       404:
 *         description: Name isn't cached
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Database failure
 *   delete:
 *     summary: Purge a character's cached portrait so it regenerates (admin-only)
 *     tags: [Admin]
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
 *         description: Purged (`removed` is false if the name wasn't cached)
 *       400:
 *         description: Valid name required
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Database failure
 */
const FORBIDDEN = {
  event: "admin_characters_forbidden",
  message: "Non-admin user denied access to purge a character",
};

/** Builds a handler that parses the target name, runs `action`, and maps a throw to a 500. */
function characterAction(
  action: (name: string, userId: string, body: Record<string, unknown>) => Promise<Response>,
) {
  return adminRoute(LIMIT, FORBIDDEN, async (req, userId) => {
    const body = await readJson(req);
    const name = readAdminName(body);
    if (name instanceof Response) return name;
    try {
      return await action(name, userId, body);
    } catch (err) {
      logEvent(
        "error",
        "admin_character_update_failed",
        "Failed to purge or regenerate a character's cached portrait",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      return Response.json({ error: "Failed to update character" }, { status: 500 });
    }
  });
}

export const PATCH = characterAction(async (name, userId, body) => {
  const category = body.category;
  if (!isCharacterCategory(category)) {
    return Response.json({ error: "Valid category required" }, { status: 400 });
  }
  if (!(await setCachedCategory(name, category))) {
    return Response.json({ error: "Character not found" }, { status: 404 });
  }
  clearCharactersCache();
  logEvent(
    "info",
    "admin_character_recategorized",
    "Admin changed a character's Wall category",
    sanitizeLogMeta({ userId, characterName: name, category }),
  );
  return Response.json({ ok: true });
});

/** POST: regenerate the cached portrait now. */
export const POST = characterAction(async (name, userId) => {
  const avatarUrl = await regenerateCachedAvatar(name);
  clearCharactersCache();
  logEvent(
    "info",
    "admin_character_regenerated",
    "Admin regenerated a character's cached portrait",
    sanitizeLogMeta({ userId, characterName: name, regenerated: avatarUrl !== null }),
  );
  if (!avatarUrl) {
    return Response.json(
      { error: "No portrait could be generated; the old one is unchanged" },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, avatarUrl });
});

/** DELETE: purge the cached portrait. */
export const DELETE = characterAction(async (name, userId) => {
  const removed = await purgeCachedAvatar(name);
  clearCharactersCache();
  logEvent(
    "info",
    "admin_character_purged",
    "Admin purged a character's cached portrait",
    sanitizeLogMeta({ userId, characterName: name, removed }),
  );
  return Response.json({ ok: true, removed });
});
