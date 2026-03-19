/**
 * API endpoint for generating character avatar images.
 * Uses Claude to build a detailed image prompt, then Google Vertex AI Imagen to generate the image.
 * Accepts POST requests with a character name and returns a base64 data URL.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import logger, { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getClaudeModel } from "../../src/utils/claudeModelSelector";
import { sanitizeCharacterName } from "../../src/utils/security";
import { extractJson } from "../../src/utils/parseClaudeJson";
import { createRateLimiter } from "../../src/utils/rateLimit";
import anthropic from "../../src/utils/anthropicClient";

/** Rate limiter: 5 requests per minute per IP (avatar generation is expensive). */
const avatarRateLimit = createRateLimiter(
  5,
  "Too many avatar generation requests from this IP, please try again later.",
);

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
 * Calls Google Vertex AI Imagen to generate an image from a prompt.
 * Returns a base64 data URL string, or null if generation fails.
 */
async function generateImageWithImagen(
  prompt: string,
  credentials: Record<string, unknown>,
  projectId: string,
): Promise<string | null> {
  const { PredictionServiceClient, helpers } = await import("@google-cloud/aiplatform");

  const client = new PredictionServiceClient({
    apiEndpoint: "us-central1-aiplatform.googleapis.com",
    credentials,
  });

  const modelId = getClaudeModel("image").primary;
  const endpoint = `projects/${projectId}/locations/us-central1/publishers/google/models/${modelId}`;

  logEvent("info", "avatar_imagen_call", "Calling Vertex AI Imagen", sanitizeLogMeta({ endpoint, prompt: prompt.slice(0, 100) }));

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const predictResponse = await (client.predict({
    endpoint,
    instances: [helpers.toValue({ prompt }) as any],
    parameters: helpers.toValue({
      sampleCount: 1,
      aspectRatio: "1:1",
      safetyFilterLevel: "block_few",
      personGeneration: "allow_all",
    }) as any,
  }) as unknown as Promise<[any, unknown, unknown]>);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [response] = predictResponse;

  const prediction = response.predictions?.[0];

  // Check for safety filter
  const safetyReason = prediction?.structValue?.fields?.safetyFilteredReason?.stringValue;
  if (safetyReason) {
    logEvent("warn", "avatar_imagen_safety_filtered", "Imagen safety filter triggered", sanitizeLogMeta({ safetyReason }));
    return null;
  }

  const b64 = prediction?.structValue?.fields?.bytesBase64Encoded?.stringValue;
  if (!b64) return null;

  return `data:image/png;base64,${b64}`;
}

/**
 * Next.js API route handler for generating a character avatar image.
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

  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: "Valid name required" });
    return;
  }
  const sanitizedName = sanitizeCharacterName(name);
  if (!sanitizedName) {
    res.status(400).json({ error: "Invalid character name" });
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
        system: `You are an expert at creating concise, unambiguous image-generation prompts for text-to-image models. Produce a deterministic prompt for a single-person portrait suitable for photorealistic rendering. The prompt must explicitly forbid multiple photos, collages, side-by-side images, reflections, split/composite images, multiple exposures, or any duplicates. Also instruct against text overlays, watermarks, logos, captions, or any extraneous elements. When the character is a real person or a known fictional character, prioritize an *accurate likeness*: capture distinctive facial features, hair, skin tone, and iconic details. For photorealism include camera/lens, lighting, and background guidance as appropriate. Always return only the requested JSON fields and do not add commentary.`,
        messages: [
          {
            role: "user",
            content: `Create an image generation prompt for ${sanitizedName}.

${sanitizedName.toLowerCase().includes('original character') || sanitizedName.toLowerCase().includes('oc ') ? 'This is an original character — create a unique appearance with clear defining details.' : 'If this is a known character or real person, describe their canonical/real appearance with specific, verifiable distinctive features. Match their real likeness as closely as possible.'}

Return JSON with these fields (strict JSON only; do not add extra commentary):
- subject: concise physical description matching canonical/real appearance (200 chars max). Include age range, ethnicity if relevant, and distinguishing facial features.
- artStyle: visual style (e.g., photorealistic, studio headshot) (50 chars max)
- composition: framing and pose guidance (e.g., close-up headshot, 3/4 view) (100 chars max)
- iconicElements: signature props, clothing, or background elements tied to the character (100 chars max)
- negativePrompts: explicit exclusions to ensure a single, realistic portrait (150 chars max). Must include: "no collage, no side-by-side photos, no multiple people, single face only, no reflections, no double exposures, no duplicates, no text, no watermark, no logo, no extra limbs, no extra hands, no extra faces".
- gender: character's gender (for voice matching)`
          }
        ],
        temperature: 0.3,
        max_tokens: 300,
      });

      const rawContent = extractJson(promptResponse.content[0]?.type === "text" ? promptResponse.content[0].text : "{}");
      const promptData = JSON.parse(rawContent);

      genderOut = promptData.gender || null;

      prompt = `Accurate likeness of ${sanitizedName}. ${promptData.subject || ""}. ${promptData.iconicElements || ""}. ${promptData.composition || ""}. Style: ${promptData.artStyle || "photorealistic"}. Match canonical appearance exactly. single, solo, alone, centered, close-up portrait, no other people. Exclude: ${promptData.negativePrompts || "multiple people, extra faces, duplicates"}`.trim();

      if (prompt.length > 1000) {
        prompt = prompt.slice(0, 1000);
      }

      logEvent("info", "avatar_prompt_generated", "Generated image prompt", sanitizeLogMeta({ prompt, gender: genderOut }));
    } catch (promptErr) {
      logger.warn("Failed to generate dynamic image prompt, using fallback:", { error: promptErr });
      prompt = `Accurate photorealistic likeness of ${sanitizedName}. Match canonical/real appearance precisely (face, hair, skin tone, and iconic features). Single subject, one person, one face; high-resolution head-and-shoulders portrait (frontal or 3/4) with neutral background and even soft lighting. Do NOT create collages, side-by-side photos, split/composite images, reflections, or duplicates. Exclude text, watermarks, logos, extra limbs, extra faces, or any compositing.`;
      logEvent("info", "avatar_prompt_fallback", "Using fallback image prompt", sanitizeLogMeta({ prompt }));
    }

    // Step 2: Generate image using Vertex AI Imagen
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

    logEvent("info", "avatar_imagen_start", "Attempting image generation with Imagen", sanitizeLogMeta({ prompt: prompt.slice(0, 100) }));

    let avatarUrl: string | null = null;
    try {
      avatarUrl = await generateImageWithImagen(prompt, credentials, projectId);
      if (avatarUrl) {
        logEvent("info", "avatar_imagen_success", "Image generated successfully with Imagen");
      }
    } catch (err) {
      logEvent("error", "avatar_imagen_error", "Vertex AI Imagen error", sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }));
    }

    if (!avatarUrl) {
      logEvent("warn", "avatar_imagen_failed", "Imagen returned no image, using silhouette");
      res.status(200).json({ avatarUrl: "/silhouette.svg", gender: genderOut });
      return;
    }

    res.status(200).json({ avatarUrl, gender: genderOut });
    return;
  } catch (e) {
    logEvent("error", "avatar_unhandled_error", "Unhandled error in generate-avatar", sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }));
    res.status(200).json({ avatarUrl: "/silhouette.svg" });
    return;
  }
}
