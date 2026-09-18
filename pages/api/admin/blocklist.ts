/**
 * Admin-only CRUD over the persistent character blocklist (src/utils/
 * characterBlocklist.ts, src/db/schema.ts's `character_blocklist` table) — the same
 * table pages/api/validate-character.ts checks before ever calling Claude. Backs the
 * /admin/moderation panel: lists every entry, lets an admin add a name manually
 * (`source: "admin"`, for a name Claude hasn't flagged yet), and remove one (an
 * "unblock" action, e.g. to correct a false positive like a name that's actually
 * public domain).
 *
 * A manual add defaults to `category: "content"` (not "copyright") — Claude's own
 * classification already auto-adds copyright "warning"s to this table (see
 * validate-character.ts), so a manual admin add is far more likely covering that
 * automatic check's gap: an abusive name, or a living person with serious real-world
 * legal risk (see characterBlocklist.ts's doc comment for what "content" means).
 * A manual add also scrubs the name from the shared avatar cache and any user's own
 * saved copy immediately — added 2026-09-17 after this endpoint's original version
 * only prevented *future* generations, leaving an already-cached/saved name (e.g. a
 * live report of "Bill Cosby" being publicly visible on the Character Wall) fully
 * visible until someone happened to re-trigger validate-character for that exact
 * name again.
 *
 * A name is never on both the blocklist and the admin-managed allowlist at once —
 * POST here also removes the name from the allowlist (see
 * src/utils/characterAllowlist.ts's removeFromAllowlist), which is what lets the
 * moderation page's "Move to Blocked" action on an allowlisted row just POST here.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { isAdmin } from "../../../src/utils/isAdmin";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import {
  listBlocklist,
  addToBlocklist,
  removeFromBlocklist,
} from "../../../src/utils/characterBlocklist";
import { removeFromAllowlist } from "../../../src/utils/characterAllowlist";
import { scrubCachedAvatar, scrubUserBotsByName } from "../../../src/utils/avatarGeneration";

/** Rate limiter: 20 requests per minute per IP, same budget as the other admin routes. */
const adminBlocklistRateLimit = createRateLimiter({
  name: "admin-blocklist",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for the admin character-blocklist panel.
 *
 * @swagger
 * /admin/blocklist:
 *   get:
 *     summary: List every blocklisted character name (admin-only)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: The full blocklist
 *       401:
 *         description: Not signed in
 *       403:
 *         description: Signed in but not an admin
 *       429:
 *         description: Rate limit exceeded
 *   post:
 *     summary: Manually add a name to the blocklist (admin-only)
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
 *               category:
 *                 type: string
 *                 enum: [copyright, content]
 *                 description: >
 *                   Defaults to "content" (abusive name, or a living person with
 *                   serious real-world legal risk) if omitted — see
 *                   src/db/schema.ts's character_blocklist doc comment.
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
 *     summary: Remove a name from the blocklist (admin-only, "unblock")
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
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(adminBlocklistRateLimit, req, res))) return;

  const userId = await getSessionUserId(req, res);
  if (!userId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!(await isAdmin(req, res))) {
    logEvent(
      "warn",
      "admin_blocklist_forbidden",
      "Non-admin user denied access to the character blocklist",
      sanitizeLogMeta({ userId }),
    );
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  if (req.method === "GET") {
    const entries = await listBlocklist();
    res.status(200).json({ entries });
    return;
  }

  if (req.method === "POST") {
    const { name, reason, category } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Valid name required" });
      return;
    }
    const trimmedName = name.trim();
    const resolvedCategory = category === "copyright" ? "copyright" : "content";
    await addToBlocklist(
      trimmedName,
      typeof reason === "string" ? reason.trim() : null,
      "admin",
      resolvedCategory,
    );
    // A name is never on both lists at once — blocking it also un-allows it, which is
    // also what makes this endpoint double as "move to blocked" from the allowlist.
    await removeFromAllowlist(trimmedName);
    // Scrub immediately, not just for future requests — see module doc above.
    await scrubCachedAvatar(trimmedName);
    void scrubUserBotsByName(trimmedName);
    logEvent(
      "info",
      "admin_blocklist_added",
      "Admin manually added a character to the blocklist",
      sanitizeLogMeta({ userId, characterName: trimmedName, category: resolvedCategory }),
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
    const removed = await removeFromBlocklist(trimmedName);
    logEvent(
      "info",
      "admin_blocklist_removed",
      "Admin removed a character from the blocklist",
      sanitizeLogMeta({ userId, characterName: trimmedName, removed }),
    );
    res.status(200).json({ ok: true, removed });
    return;
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
