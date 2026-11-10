/**
 * Admin-only CRUD over the admin-managed character allowlist (src/utils/
 * characterAllowlist.ts, src/db/schema.ts's `character_allowlist` table) — the
 * counterpart to app/api/admin/blocklist/route.ts, managed on the same /admin/moderation
 * page. A name here is permanently treated as copyright-safe without ever calling
 * Claude, for a name that isn't on the static curated list (src/data/
 * characterNames.ts) but an admin wants allowed anyway (e.g. a real person Claude
 * incorrectly flagged, or a false positive not worth waiting on a prompt fix for).
 *
 * A name is never on both the allowlist and the blocklist at once — POST here also
 * removes the name from the blocklist (see src/utils/moderation/characterBlocklist.ts's
 * removeFromBlocklist), which is what lets the moderation page's "Move to Allowed"
 * action on a blocked row just POST here.
 */

import { adminRoute, readAdminName } from "../../../../utils/account/adminGuard";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";
import {
  listAllowlist,
  addToAllowlist,
  removeFromAllowlist,
} from "../../../../utils/moderation/characterAllowlist";
import { removeFromBlocklist } from "../../../../utils/moderation/characterBlocklist";
import { readJson } from "../../../../utils/server/withRoute";

const LIMIT = {
  name: "admin-allowlist",
  max: 20,
  message: "Too many requests from this IP, please try again later.",
};

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
const FORBIDDEN = {
  event: "admin_allowlist_forbidden",
  message: "Non-admin user denied access to the character allowlist",
};

export const GET = adminRoute(LIMIT, FORBIDDEN, async () =>
  Response.json({ entries: await listAllowlist() }),
);

/** POST: allow a name (and un-block it). */
export const POST = adminRoute(LIMIT, FORBIDDEN, async (req, userId) => {
  const body = await readJson(req);
  const name = readAdminName(body);
  if (name instanceof Response) return name;
  await addToAllowlist(name, typeof body.reason === "string" ? body.reason.trim() : null);
  // A name is never on both lists at once: allowing it also un-blocks it, which is
  // also what makes this endpoint double as "move to allowed" from the blocklist.
  await removeFromBlocklist(name);
  logEvent(
    "info",
    "admin_allowlist_added",
    "Admin manually added a character to the allowlist",
    sanitizeLogMeta({ userId, characterName: name }),
  );
  return Response.json({ ok: true });
});

/** DELETE: remove a name from the allowlist. */
export const DELETE = adminRoute(LIMIT, FORBIDDEN, async (req, userId) => {
  const name = readAdminName(await readJson(req));
  if (name instanceof Response) return name;
  const removed = await removeFromAllowlist(name);
  logEvent(
    "info",
    "admin_allowlist_removed",
    "Admin removed a character from the allowlist",
    sanitizeLogMeta({ userId, characterName: name, removed }),
  );
  return Response.json({ ok: true, removed });
});
