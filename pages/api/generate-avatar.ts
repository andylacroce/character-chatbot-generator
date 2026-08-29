/**
 * API endpoint for generating character avatar images.
 * Uses Claude to build a detailed image prompt, then Gemini image generation on
 * Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI) to render the image.
 * Accepts POST requests with a character name and returns either a durable Vercel Blob
 * URL (when a Blob token is configured) or a base64 data URL (fallback).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import logger, { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getClaudeModel } from "../../src/utils/claudeModelSelector";
import { sanitizeCharacterName } from "../../src/utils/security";
import { extractJson } from "../../src/utils/parseClaudeJson";
import { createRateLimiter } from "../../src/utils/rateLimit";
import anthropic from "../../src/utils/anthropicClient";
import { getDb } from "../../src/db/client";
import { avatarCache } from "../../src/db/schema";

/** Rate limiter: 5 requests per minute per IP (avatar generation is expensive). */
const avatarRateLimit = createRateLimiter({
  name: "avatar",
  max: 5,
  message: "Too many avatar generation requests from this IP, please try again later.",
});

/**
 * Loads GCP credentials from env var (raw JSON string in Vercel, file path locally).
 */
function loadGcpCredentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (raw.trim().startsWith("{")) {
    return JSON.parse(raw);
  }
  return JSON.parse(fs.readFileSync(raw, "utf8"));
}

/**
 * Calls Gemini image generation on Google Cloud's Gemini Enterprise Agent Platform
 * (formerly Vertex AI) to generate an image from a prompt.
 * Returns a base64 data URL string, or null if generation fails.
 */
async function generateImageWithGemini(
  prompt: string,
  credentials: Record<string, unknown>,
  projectId: string,
): Promise<string | null> {
  const { GoogleGenAI } = await import("@google/genai");

  const client = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    // Gemini image models are only served from the "global" endpoint, unlike
    // the legacy Imagen predict API which used a regional (us-central1) endpoint.
    location: "global",
    googleAuthOptions: { credentials },
  });

  const modelId = getClaudeModel("image").primary;

  logEvent("info", "avatar_gemini_call", "Calling Gemini image generation", sanitizeLogMeta({ model: modelId, prompt: prompt.slice(0, 100) }));

  const response = await client.models.generateContent({
    model: modelId,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "1:1", personGeneration: "ALLOW_ALL" },
    },
  });

  const candidate = response.candidates?.[0];

  // Check for safety filtering, either on the prompt or the generated candidate.
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;
  const safetyBlocked = Boolean(blockReason) || (typeof finishReason === "string" && /SAFETY|PROHIBITED/i.test(finishReason));
  if (safetyBlocked) {
    logEvent("warn", "avatar_gemini_safety_filtered", "Gemini image safety filter triggered", sanitizeLogMeta({ blockReason, finishReason }));
    return null;
  }

  const imagePart = candidate?.content?.parts?.find((part) => part.inlineData?.data);
  const b64 = imagePart?.inlineData?.data;
  if (!b64) return null;

  const mimeType = imagePart.inlineData?.mimeType || "image/png";
  return `data:${mimeType};base64,${b64}`;
}

/**
 * Uploads a base64 data URL image to Vercel Blob and returns its durable public URL.
 * Falls back to returning the original data URL when no Blob token is configured (local
 * dev with no Blob store set up) or if the upload itself fails, so avatar generation
 * never fails outright over storage.
 */
async function persistAvatarToBlob(dataUrl: string): Promise<string> {
  const blobToken = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) return dataUrl;

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) return dataUrl;
  const [, mimeType, base64Data] = match;
  const ext = mimeType.split("/")[1] || "png";

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const blob = await put(`avatars/${crypto.randomUUID()}.${ext}`, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: mimeType,
      token: blobToken,
    });
    return blob.url;
  } catch (err) {
    logEvent("error", "avatar_blob_upload_failed", "Failed to upload avatar to Blob, using data URL", sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }));
    return dataUrl;
  }
}

/** Cache key: lowercased so "Sherlock Holmes" and "sherlock holmes" share a hit. */
function avatarCacheKey(sanitizedName: string): string {
  return sanitizedName.toLowerCase();
}

/**
 * Looks up a previously-generated avatar shared across every user (and guests) by
 * character name — Gemini image generation is comparatively expensive, so a name
 * generated once is reused from then on. Returns null on a miss, when no
 * DATABASE_URL is configured, or on any DB error — caching is a cost optimization,
 * never a requirement for avatar generation to work.
 */
async function getCachedAvatar(sanitizedName: string): Promise<{ avatarUrl: string; gender: string | null } | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await getDb()
      .select()
      .from(avatarCache)
      .where(eq(avatarCache.characterName, avatarCacheKey(sanitizedName)));
    const row = rows[0];
    return row ? { avatarUrl: row.avatarUrl, gender: row.gender } : null;
  } catch (err) {
    logEvent("error", "avatar_cache_lookup_failed", "Avatar cache lookup failed", sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

/**
 * Stores a successfully-generated avatar in the shared cache. Never called with the
 * `/silhouette.svg` fallback — caching a failure would permanently deny a name a
 * real portrait even after a transient Gemini outage resolves. Best-effort: a
 * failure here doesn't fail the request, since the caller already has their avatar.
 */
async function cacheAvatar(sanitizedName: string, avatarUrl: string, gender: string | null): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getDb()
      .insert(avatarCache)
      .values({ characterName: avatarCacheKey(sanitizedName), avatarUrl, gender })
      .onConflictDoUpdate({
        target: avatarCache.characterName,
        set: { avatarUrl, gender },
      });
  } catch (err) {
    logEvent("error", "avatar_cache_write_failed", "Avatar cache write failed", sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }));
  }
}

/**
 * Next.js API route handler for generating a character avatar image.
 *
 * @swagger
 * /generate-avatar:
 *   post:
 *     summary: Generate a character avatar image
 *     description: >
 *       Two-stage: Claude writes an SFW image-description prompt, then Gemini
 *       image generation (Google Cloud's Gemini Enterprise Agent Platform) renders
 *       a square PNG. When a Vercel Blob token (VERCEL_BLOB_READ_WRITE_TOKEN or
 *       BLOB_READ_WRITE_TOKEN) is configured, the image is uploaded to Blob and a
 *       durable URL is returned; otherwise (e.g. local dev with no Blob store) it
 *       falls back to a base64 data URL. Rate limited to 5 requests/minute/IP since
 *       image generation is comparatively expensive. Falls back to `/silhouette.svg`
 *       (still a 200 response) on any generation failure, missing
 *       GOOGLE_CLOUD_PROJECT, or a safety filter trigger — it never surfaces a 5xx
 *       for a failed generation.
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
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // Apply rate limiting
  await new Promise<void>((resolve) => {
    avatarRateLimit(req, res, () => resolve());
  });
  if (res.headersSent) {
    return;
  }

  const { name, skipPersistence } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: "Valid name required" });
    return;
  }
  const sanitizedName = sanitizeCharacterName(name);
  if (!sanitizedName) {
    res.status(400).json({ error: "Invalid character name" });
    return;
  }
  // Set when the client is creating a character whose name was flagged by
  // /api/validate-character and the user chose to proceed anyway. That image must
  // never enter the shared cross-user cache or durable Blob storage — a
  // per-request, never-persisted generation only, however costly to redo each time.
  const bypassPersistence = skipPersistence === true;

  const cached = bypassPersistence ? null : await getCachedAvatar(sanitizedName);
  if (cached) {
    logEvent("info", "avatar_cache_hit", "Reusing cached avatar", sanitizeLogMeta({ name: sanitizedName }));
    res.status(200).json({ avatarUrl: cached.avatarUrl, gender: cached.gender });
    return;
  }

  let genderOut: string | null = null;

  try {
    logEvent("info", "avatar_generate_start", "Avatar generation started", sanitizeLogMeta({ name: sanitizedName }));

    // Step 1: Build image prompt using Claude
    let prompt: string;
    try {
      logEvent("info", "avatar_prompt_start", "Generating image prompt via Claude");

      const textModel = getClaudeModel("text-simple");
      const promptResponse = await anthropic.messages.create({
        model: textModel,
        system: `You are an expert at creating concise, unambiguous image-generation prompts for text-to-image models. Produce a deterministic prompt for a single-person portrait suitable for illustrated/stylized rendering. The prompt must explicitly forbid multiple photos, collages, side-by-side images, reflections, split/composite images, multiple exposures, or any duplicates. Also instruct against text overlays, watermarks, logos, captions, or any extraneous elements. You must NEVER request an accurate likeness of a real person (no actor, celebrity, or public figure's actual face or identity) and must NEVER request an exact reproduction of a copyrighted character's specific design (exact costume, logo, or studio-owned visual design). Instead, describe a generic archetype evoked by the name (e.g., broad build, era-appropriate style, general vibe/personality) using original, non-infringing details — enough to be thematically recognizable without copying a specific person's face or a specific copyrighted design. For original characters, invent a unique appearance with clear defining details. Always return only the requested JSON fields and do not add commentary.`,
        messages: [
          {
            role: "user",
            content: `Create an image generation prompt for a character loosely inspired by "${sanitizedName}".

${sanitizedName.toLowerCase().includes('original character') || sanitizedName.toLowerCase().includes('oc ') ? 'This is an original character — create a unique appearance with clear defining details.' : 'Do not depict this as a real person or reproduce a specific copyrighted design. Describe a generic, original interpretation that evokes the general archetype/vibe (e.g., role, era, broad style) without copying any real individual\'s actual face/identity or any studio-owned character design.'}

Return JSON with these fields (strict JSON only; do not add extra commentary):
- subject: concise physical description of an original/generic character (200 chars max). Include age range and general style; do not describe a specific real person's face or an exact copyrighted design.
- artStyle: visual style (e.g., stylized illustration, digital painting) (50 chars max). Avoid "photorealistic" for real people or copyrighted characters.
- composition: framing and pose guidance (e.g., close-up headshot, 3/4 view) (100 chars max)
- iconicElements: generic props, clothing, or background elements evoking the theme without copying a specific copyrighted design (100 chars max)
- negativePrompts: explicit exclusions to ensure a single, original portrait (150 chars max). Must include: "no collage, no side-by-side photos, no multiple people, single face only, no reflections, no double exposures, no duplicates, no text, no watermark, no logo, no extra limbs, no extra hands, no extra faces, not a real person, no celebrity likeness, no exact copyrighted design".
- gender: character's gender (for voice matching)`
          }
        ],
        temperature: 0.3,
        max_tokens: 300,
      });

      const rawContent = extractJson(promptResponse.content[0]?.type === "text" ? promptResponse.content[0].text : "{}");
      const promptData = JSON.parse(rawContent);

      genderOut = promptData.gender || null;

      prompt = `Original, stylized character illustration loosely inspired by the name "${sanitizedName}", not a depiction of any real person and not an exact reproduction of any copyrighted character design. ${promptData.subject || ""}. ${promptData.iconicElements || ""}. ${promptData.composition || ""}. Style: ${promptData.artStyle || "stylized illustration"}. single, solo, alone, centered, close-up portrait, no other people. Exclude: ${promptData.negativePrompts || "multiple people, extra faces, duplicates, real person likeness, exact copyrighted design"}`.trim();

      if (prompt.length > 1000) {
        prompt = prompt.slice(0, 1000);
      }

      logEvent("info", "avatar_prompt_generated", "Generated image prompt", sanitizeLogMeta({ prompt, gender: genderOut }));
    } catch (promptErr) {
      logger.warn("Failed to generate dynamic image prompt, using fallback:", { error: promptErr });
      prompt = `Original, stylized character illustration loosely inspired by the name "${sanitizedName}", depicting a generic archetype rather than any real person's actual likeness or any specific copyrighted character design. Single subject, one person, one face; head-and-shoulders portrait (frontal or 3/4) with neutral background and even soft lighting. Do NOT create collages, side-by-side photos, split/composite images, reflections, or duplicates. Exclude text, watermarks, logos, extra limbs, extra faces, real-person likeness, exact copyrighted designs, or any compositing.`;
      logEvent("info", "avatar_prompt_fallback", "Using fallback image prompt", sanitizeLogMeta({ prompt }));
    }

    // Step 2: Generate image using Gemini image generation
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      logEvent("error", "avatar_missing_project", "Missing GOOGLE_CLOUD_PROJECT env var");
      res.status(200).json({ avatarUrl: "/silhouette.svg", gender: genderOut });
      return;
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = loadGcpCredentials();
    } catch (credErr) {
      logEvent("error", "avatar_cred_error", "Failed to load GCP credentials", sanitizeLogMeta({ error: credErr instanceof Error ? credErr.message : String(credErr) }));
      res.status(200).json({ avatarUrl: "/silhouette.svg", gender: genderOut });
      return;
    }

    logEvent("info", "avatar_gemini_start", "Attempting image generation with Gemini", sanitizeLogMeta({ prompt: prompt.slice(0, 100) }));

    let avatarUrl: string | null = null;
    try {
      avatarUrl = await generateImageWithGemini(prompt, credentials, projectId);
      if (avatarUrl) {
        logEvent("info", "avatar_gemini_success", "Image generated successfully with Gemini");
        if (!bypassPersistence) {
          avatarUrl = await persistAvatarToBlob(avatarUrl);
        }
      }
    } catch (err) {
      logEvent("error", "avatar_gemini_error", "Gemini image generation error", sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }));
    }

    if (!avatarUrl) {
      logEvent("warn", "avatar_gemini_failed", "Gemini returned no image, using silhouette");
      res.status(200).json({ avatarUrl: "/silhouette.svg", gender: genderOut });
      return;
    }

    if (!bypassPersistence) {
      await cacheAvatar(sanitizedName, avatarUrl, genderOut);
    }
    res.status(200).json({ avatarUrl, gender: genderOut });
    return;
  } catch (e) {
    logEvent("error", "avatar_unhandled_error", "Unhandled error in generate-avatar", sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }));
    res.status(200).json({ avatarUrl: "/silhouette.svg" });
    return;
  }
}
