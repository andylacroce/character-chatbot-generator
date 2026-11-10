/**
 * Admin-only control of a character's shared `avatar_cache` row. PATCH moves it to another Wall
 * category. For a bad image, DELETE purges the portrait (the next creation of that name builds a fresh one); POST regenerates it
 * now, swapping the new image in place. Both leave users' saved characters, the blocklist, and
 * the allowlist alone (blocking a name is the separate /admin/blocklist action), and both clear
 * the Wall's per-instance list cache so a stale tile doesn't point at a deleted image.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { readAdminName, requireAdmin } from "../../../utils/account/adminGuard";
import { createRateLimiter, applyRateLimit } from "../../../utils/server/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { isCharacterCategory } from "character-chatbot-shared";
import {
  purgeCachedAvatar,
  regenerateCachedAvatar,
  setCachedCategory,
} from "../../../utils/avatar/avatarGeneration";
import { clearCharactersCache } from "../../../utils/moderation/charactersWall";
import { withRequestLog } from "../../../utils/server/withRequestLog";

/** Rate limiter: 20 requests per minute per IP, same budget as the other admin routes. */
const adminCharactersRateLimit = createRateLimiter({
  name: "admin-characters",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

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
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(adminCharactersRateLimit, req, res))) return;

  const userId = await requireAdmin(req, res, {
    event: "admin_characters_forbidden",
    message: "Non-admin user denied access to purge a character",
  });
  if (!userId) return;

  if (req.method !== "DELETE" && req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", ["DELETE", "PATCH", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const name = readAdminName(req, res);
  if (!name) return;
  try {
    if (req.method === "PATCH") {
      const category: unknown = req.body?.category;
      if (!isCharacterCategory(category)) {
        res.status(400).json({ error: "Valid category required" });
        return;
      }
      if (!(await setCachedCategory(name, category))) {
        res.status(404).json({ error: "Character not found" });
        return;
      }
      clearCharactersCache();
      logEvent(
        "info",
        "admin_character_recategorized",
        "Admin changed a character's Wall category",
        sanitizeLogMeta({ userId, characterName: name, category }),
      );
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "POST") {
      const avatarUrl = await regenerateCachedAvatar(name);
      clearCharactersCache();
      logEvent(
        "info",
        "admin_character_regenerated",
        "Admin regenerated a character's cached portrait",
        sanitizeLogMeta({ userId, characterName: name, regenerated: avatarUrl !== null }),
      );
      if (!avatarUrl) {
        res.status(502).json({ error: "No portrait could be generated; the old one is unchanged" });
        return;
      }
      res.status(200).json({ ok: true, avatarUrl });
      return;
    }
    const removed = await purgeCachedAvatar(name);
    clearCharactersCache();
    logEvent(
      "info",
      "admin_character_purged",
      "Admin purged a character's cached portrait",
      sanitizeLogMeta({ userId, characterName: name, removed }),
    );
    res.status(200).json({ ok: true, removed });
  } catch (err) {
    logEvent(
      "error",
      "admin_character_update_failed",
      "Failed to purge or regenerate a character's cached portrait",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to update character" });
  }
}

export default withRequestLog(handler);
