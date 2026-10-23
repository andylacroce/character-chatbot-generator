/**
 * Admin-only control of a character's shared portrait (`avatar_cache` row), for a bad image.
 * DELETE purges it (the next creation of that name builds a fresh one); POST regenerates it
 * now, swapping the new image in place. Both leave users' saved characters, the blocklist, and
 * the allowlist alone (blocking a name is the separate /admin/blocklist action), and both clear
 * the Wall's per-instance list cache so a stale tile doesn't point at a deleted image.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { readAdminName, requireAdmin } from "../../../utils/adminGuard";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { purgeCachedAvatar, regenerateCachedAvatar } from "../../../utils/avatarGeneration";
import { clearCharactersCache } from "../../../utils/charactersWall";
import { withRequestLog } from "../../../utils/withRequestLog";

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

  if (req.method !== "DELETE" && req.method !== "POST") {
    res.setHeader("Allow", ["DELETE", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const name = readAdminName(req, res);
  if (!name) return;
  try {
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
