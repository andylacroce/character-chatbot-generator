/**
 * Admin-only CRUD over the persistent character blocklist (src/utils/
 * characterBlocklist.ts, src/db/schema.ts's `character_blocklist` table) — the same
 * table app/api/validate-character/route.ts checks before ever calling Claude. Backs the
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
 * src/utils/moderation/characterAllowlist.ts's removeFromAllowlist), which is what lets the
 * moderation page's "Move to Blocked" action on an allowlisted row just POST here.
 */

import { adminRoute, readAdminName } from "../../../../utils/account/adminGuard";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";
import {
  listBlocklist,
  addToBlocklist,
  removeFromBlocklist,
} from "../../../../utils/moderation/characterBlocklist";
import { removeFromAllowlist } from "../../../../utils/moderation/characterAllowlist";
import { scrubCachedAvatar, scrubUserBotsByName } from "../../../../utils/avatar/avatarGeneration";
import { readJson } from "../../../../utils/server/withRoute";

const LIMIT = {
  name: "admin-blocklist",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

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
const FORBIDDEN = {
  event: "admin_blocklist_forbidden",
  message: "Non-admin user denied access to the character blocklist",
};

export const GET = adminRoute(LIMIT, FORBIDDEN, async () =>
  Response.json({ entries: await listBlocklist() }),
);

/** POST: block a name (and un-allow it), scrubbing its portrait and users' saved copies now. */
export const POST = adminRoute(LIMIT, FORBIDDEN, async (req, userId) => {
  const body = await readJson(req);
  const name = readAdminName(body);
  if (name instanceof Response) return name;
  const category = body.category === "copyright" ? "copyright" : "content";
  await addToBlocklist(
    name,
    typeof body.reason === "string" ? body.reason.trim() : null,
    "admin",
    category,
  );
  // A name is never on both lists at once: blocking it also un-allows it, which is
  // also what makes this endpoint double as "move to blocked" from the allowlist.
  await removeFromAllowlist(name);
  // Scrub immediately, not just for future requests.
  await scrubCachedAvatar(name);
  await scrubUserBotsByName(name);
  logEvent(
    "info",
    "admin_blocklist_added",
    "Admin manually added a character to the blocklist",
    sanitizeLogMeta({ userId, characterName: name, category }),
  );
  return Response.json({ ok: true });
});

/** DELETE: remove a name from the blocklist. */
export const DELETE = adminRoute(LIMIT, FORBIDDEN, async (req, userId) => {
  const name = readAdminName(await readJson(req));
  if (name instanceof Response) return name;
  const removed = await removeFromBlocklist(name);
  logEvent(
    "info",
    "admin_blocklist_removed",
    "Admin removed a character from the blocklist",
    sanitizeLogMeta({ userId, characterName: name, removed }),
  );
  return Response.json({ ok: true, removed });
});
