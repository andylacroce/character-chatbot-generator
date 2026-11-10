/**
 * API endpoint for validating character names against copyright and trademark concerns.
 * Uses Claude to determine if a character is likely protected by copyright or trademark.
 */

import type { NextRequest } from "next/server";
import { validateCharacterName } from "../../../utils/moderation/validateCharacter";
import { withRoute, readJson } from "../../../utils/server/withRoute";

const LIMIT = {
  name: "validate-character",
  max: 30,
  message: "Too many validation requests from this IP, please try again later.",
};

/**
 * Next.js API route handler for validating character names.
 * Returns whether the character is safe to use, if copyright/trademark concerns
 * exist, and whether the name itself must be hard-blocked (abusive content, or a
 * living person with serious real-world legal risk).
 *
 * @swagger
 * /validate-character:
 *   post:
 *     summary: Validate a character name for copyright/trademark concerns and hard-block content
 *     description: >
 *       A name on the curated public-domain allowlist (src/utils/moderation/characterAllowlist.ts)
 *       or the persistent blocklist (src/utils/moderation/characterBlocklist.ts) short-circuits
 *       straight to a result without ever calling Claude. Otherwise uses Claude for three
 *       independent checks: whether the name is public-domain-safe, cautionary, or a
 *       clear copyright/trademark violation (warningLevel — always overridable), and
 *       whether the name must be hard-blocked (blocked — never overridable, since
 *       created characters appear on the public /characters gallery) because it's itself
 *       profane/abusive OR identifies a real, currently-living person with a serious
 *       real-world criminal conviction/allegation (historical/deceased figures and
 *       ordinary celebrity controversy are deliberately excluded from this second
 *       reason). A "warning" or a `blocked: true` result is each added to the
 *       blocklist for future consistency, tagged with which of the two it was; either
 *       way, if the name was already cached from a prior generation (or saved by a
 *       user to their own account), that's also deleted/scrubbed and scrubbed: true is
 *       set on a "warning"-driven scrub (never overridable either way — `blocked: true`
 *       is already never-overridable regardless). Rate limited to 30 requests/minute/IP.
 *       The third check determines whether this is an established, supported figure;
 *       unrecognized names are rejected by both clients before generation. On an internal
 *       error, responds 200 with warningLevel "none", blocked false, and recognized true.
 *     tags: [Character]
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
 *                 example: Mickey Mouse
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characterName:
 *                   type: string
 *                 isPublicDomain:
 *                   type: boolean
 *                 isSafe:
 *                   type: boolean
 *                 warningLevel:
 *                   type: string
 *                   enum: [none, caution, warning]
 *                 reason:
 *                   type: string
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 blocked:
 *                   type: boolean
 *                   description: >
 *                     True when the name itself is profane/abusive, OR it identifies
 *                     a real, currently-living person with a serious real-world
 *                     criminal conviction/allegation — distinct from warningLevel
 *                     (copyright-only, always overridable). Never overridable: the
 *                     character wall at /characters is public.
 *                 recognized:
 *                   type: boolean
 *                   description: >
 *                     False when the name doesn't correspond to an established
 *                     character/person Claude actually knows. Both clients reject the
 *                     name before personality, portrait, or voice generation.
 *                 scrubbed:
 *                   type: boolean
 *                   description: >
 *                     True when this name was already cached (previously public on
 *                     the Character Wall/carousel) and this call's re-check flagged
 *                     it as a "warning"-level copyright/trademark concern — the
 *                     cached row has already been deleted server-side. Never
 *                     overridable, unlike an ordinary warningLevel "warning" for a
 *                     brand-new name.
 *       400:
 *         description: Valid character name required
 *       429:
 *         description: Rate limit exceeded
 */
export const POST = withRoute(LIMIT, async (req: NextRequest) => {
  const { name } = await readJson(req);

  if (!name || typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Valid character name required" }, { status: 400 });
  }

  return Response.json(await validateCharacterName(name.trim()));
});
