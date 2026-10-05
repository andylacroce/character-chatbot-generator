/**
 * API endpoint for generating character avatar images.
 * Uses Claude to build a detailed image prompt, then renders it on free image
 * providers only — Cloudflare Workers AI (Flux Schnell) first, falling back to
 * Pollinations.ai if Cloudflare isn't configured or fails. Accepts POST requests
 * with a character name and returns either a durable Vercel Blob URL (when a Blob
 * token is configured) or a base64 data URL (fallback). The generation/caching
 * pipeline itself lives in src/utils/avatarGeneration.ts, shared with the guessing
 * games (src/utils/game/round.ts), which calls it in-process instead of
 * over HTTP.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sanitizeCharacterName } from "../../utils/security";
import { createRateLimiter, applyRateLimit } from "../../utils/rateLimit";
import { getOrGenerateAvatar } from "../../utils/avatarGeneration";
import { isAllowlisted } from "../../utils/characterAllowlist";
import { getBlocklistEntry } from "../../utils/characterBlocklist";
import { withRequestLog } from "../../utils/withRequestLog";

/** Rate limiter: 5 requests per minute per IP (avatar generation is expensive). */
const avatarRateLimit = createRateLimiter({
  name: "avatar",
  max: 5,
  message: "Too many avatar generation requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for generating a character avatar image.
 *
 * @swagger
 * /generate-avatar:
 *   post:
 *     summary: Generate a character avatar image
 *     description: >
 *       Two-stage: Claude writes an SFW image-description prompt, then an image
 *       model renders a square PNG from it — free providers only. Cloudflare
 *       Workers AI (Flux Schnell) is tried first when CLOUDFLARE_ACCOUNT_ID and
 *       CLOUDFLARE_API_TOKEN are configured, falling back to Pollinations.ai (free,
 *       anonymous, no cap) when Cloudflare isn't configured or fails, including
 *       exhausting its free daily neuron allocation — no paid image provider, no
 *       payment method ever required. When a Vercel Blob token
 *       (VERCEL_BLOB_READ_WRITE_TOKEN or BLOB_READ_WRITE_TOKEN) is configured, the
 *       image is uploaded to Blob and a durable URL is returned; otherwise (e.g.
 *       local dev with no Blob store) it falls back to a base64 data URL. Rate
 *       limited to 5 requests/minute/IP since image generation is comparatively
 *       expensive. Falls back to `/silhouette.svg` (still a 200 response) only when
 *       neither provider returns an image — it never surfaces a 5xx for a failed
 *       generation.
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
 *                 example: Sherlock Holmes
 *               skipPersistence:
 *                 type: boolean
 *                 description: >
 *                   Set by the client when the character name was flagged by
 *                   /api/validate-character and the user chose to proceed anyway.
 *                   Skips the shared avatar_cache table (both lookup and write) and
 *                   Vercel Blob upload, returning a base64 data URL instead of a
 *                   durable link — the image is generated fresh every time and never
 *                   persisted anywhere server-side.
 *     responses:
 *       200:
 *         description: >
 *           Avatar URL — a durable Vercel Blob URL when Blob is configured, a base64
 *           data URL otherwise, or the silhouette fallback on generation failure
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 avatarUrl:
 *                   type: string
 *                   example: /silhouette.svg
 *                 gender:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: Valid name required, or invalid character name
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // Apply rate limiting
  if (!(await applyRateLimit(avatarRateLimit, req, res))) {
    return;
  }

  const { name, skipPersistence } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Valid name required" });
    return;
  }
  const sanitizedName = sanitizeCharacterName(name);
  if (!sanitizedName) {
    res.status(400).json({ error: "Invalid character name" });
    return;
  }

  // This route is callable directly, so it can't rely on the client having run
  // /api/validate-character: a blocklisted name must never gain a public Wall portrait.
  // A private render (skipPersistence) is never stored, so it needs no check. Otherwise a
  // content block gets no image at all and a copyright block is only rendered privately.
  let persist = skipPersistence !== true;
  if (persist && !(await isAllowlisted(sanitizedName))) {
    const blocked = await getBlocklistEntry(sanitizedName);
    if (blocked?.category === "content") {
      res.status(200).json({ avatarUrl: "/silhouette.svg", gender: null });
      return;
    }
    persist = !blocked;
  }
  const result = await getOrGenerateAvatar(sanitizedName, { skipPersistence: !persist });

  res.status(200).json({ avatarUrl: result.avatarUrl, gender: result.gender });
}

export default withRequestLog(handler);
