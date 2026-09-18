/**
 * Admin-only CRUD over the admin-managed character allowlist (src/utils/
 * characterAllowlist.ts, src/db/schema.ts's `character_allowlist` table) — the
 * counterpart to pages/api/admin/blocklist.ts, managed on the same /admin/moderation
 * page. A name here is permanently treated as copyright-safe without ever calling
 * Claude, for a name that isn't on the static curated list (src/data/
 * characterNames.ts) but an admin wants allowed anyway (e.g. a real person Claude
 * incorrectly flagged, or a false positive not worth waiting on a prompt fix for).
 *
 * A name is never on both the allowlist and the blocklist at once — POST here also
 * removes the name from the blocklist (see src/utils/characterBlocklist.ts's
 * removeFromBlocklist), which is what lets the moderation page's "Move to Allowed"
 * action on a blocked row just POST here.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { isAdmin } from "../../../src/utils/isAdmin";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import {
  listAllowlist,
  addToAllowlist,
  removeFromAllowlist,
} from "../../../src/utils/characterAllowlist";
import { removeFromBlocklist } from "../../../src/utils/characterBlocklist";
import { withRequestLog } from "../../../src/utils/withRequestLog";

/** Rate limiter: 20 requests per minute per IP, same budget as the other admin routes. */
const adminAllowlistRateLimit = createRateLimiter({
  name: "admin-allowlist",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for the admin character-allowlist panel.
 *
 * @swagger
 * /admin/allowlist:
 *   get:
 *     summary: List every admin-managed allowlisted character name (admin-only)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: The full admin-managed allowlist
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *   post:
 *     summary: Manually add a name to the allowlist (admin-only)
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Added
 *       400:
 *         description: Valid name required
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *   delete:
 *     summary: Remove a name from the admin-managed allowlist (admin-only)
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
 *         description: Removed (or already absent)
 *       400:
 *         description: Valid name required
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(adminAllowlistRateLimit, req, res))) return;

  const userId = await getSessionUserId(req, res);
  if (!userId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!(await isAdmin(req, res))) {
    logEvent(
      "warn",
      "admin_allowlist_forbidden",
      "Non-admin user denied access to the character allowlist",
      sanitizeLogMeta({ userId }),
    );
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  if (req.method === "GET") {
    const entries = await listAllowlist();
    res.status(200).json({ entries });
    return;
  }

  if (req.method === "POST") {
    const { name, reason } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Valid name required" });
      return;
    }
    const trimmedName = name.trim();
    await addToAllowlist(trimmedName, typeof reason === "string" ? reason.trim() : null);
    // A name is never on both lists at once — allowing it also un-blocks it, which is
    // also what makes this endpoint double as "move to allowed" from the blocklist.
    await removeFromBlocklist(trimmedName);
    logEvent(
      "info",
      "admin_allowlist_added",
      "Admin manually added a character to the allowlist",
      sanitizeLogMeta({ userId, characterName: trimmedName }),
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Valid name required" });
      return;
    }
    const trimmedName = name.trim();
    const removed = await removeFromAllowlist(trimmedName);
    logEvent(
      "info",
      "admin_allowlist_removed",
      "Admin removed a character from the allowlist",
      sanitizeLogMeta({ userId, characterName: trimmedName, removed }),
    );
    res.status(200).json({ ok: true, removed });
    return;
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}

export default withRequestLog(handler);
