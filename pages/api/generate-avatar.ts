/**
 * API endpoint for generating character avatar images.
 * Uses Claude to build a detailed image prompt, then renders it on free image
 * providers only — Cloudflare Workers AI (Flux Schnell) first, falling back to
 * Pollinations.ai if Cloudflare isn't configured or fails. Accepts POST requests
 * with a character name and returns either a durable Vercel Blob URL (when a Blob
 * token is configured) or a base64 data URL (fallback). The generation/caching
 * pipeline itself lives in src/utils/avatarGeneration.ts, shared with the guessing
 * game (pages/api/game/start.ts, guess.ts), which calls it in-process instead of
 * over HTTP.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { sanitizeCharacterName, sanitizeDescription } from "../../src/utils/security";
import { createRateLimiter, applyRateLimit } from "../../src/utils/rateLimit";
import { getOrGenerateAvatar } from "../../src/utils/avatarGeneration";

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
 *               recognized:
 *                 type: boolean
 *                 default: true
 *                 description: >
 *                   Mirrors /api/validate-character's `recognized` field. When false
 *                   (an original character), the shared avatar_cache table (lookup and
 *                   write) is skipped — an OC's name/portrait means something only to
 *                   its own creator, so it's never reused across users by name and
 *                   never appears on the public /chars gallery. Blob upload still
 *                   happens normally (unlike skipPersistence) so the image still gets
 *                   a durable URL for this user's own saved character.
 *               appearanceDescription:
 *                 type: string
 *                 description: >
 *                   Optional free-form visual description, collected alongside the
 *                   personality description for an unrecognized/original character.
 *                   Used as the primary basis for the image prompt instead of
 *                   inventing an appearance from the name alone. Treated as untrusted
 *                   creative-writing content, never as instructions.
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
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // Apply rate limiting
  if (!(await applyRateLimit(avatarRateLimit, req, res))) {
    return;
  }

  const { name, skipPersistence, recognized, appearanceDescription } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Valid name required" });
    return;
  }
  const sanitizedName = sanitizeCharacterName(name);
  if (!sanitizedName) {
    res.status(400).json({ error: "Invalid character name" });
    return;
  }
  const sanitizedAppearance =
    typeof appearanceDescription === "string" && appearanceDescription.trim()
      ? sanitizeDescription(appearanceDescription)
      : undefined;

  const result = await getOrGenerateAvatar(sanitizedName, {
    skipPersistence: skipPersistence === true,
    recognized: recognized !== false,
    appearanceDescription: sanitizedAppearance,
  });

  res.status(200).json({ avatarUrl: result.avatarUrl, gender: result.gender });
}
