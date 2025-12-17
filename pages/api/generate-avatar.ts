/**
 * API endpoint for generating character avatar images via OpenAI.
 * Accepts POST requests with a character name and returns an image URL or data URL.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import logger, { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getOpenAIModel } from "../../src/utils/openaiModelSelector";
import type { OpenAIImageGenerateParams } from "../../src/types/openai-image";
import { sanitizeCharacterName } from "../../src/utils/security";
import rateLimit from "express-rate-limit";

// Rate limiter: 5 requests per minute per IP (avatar generation is expensive)
const avatarRateLimit = rateLimit({
  windowMs: 60 * 1000, // Rate limit window: 1 minute
  max: 5, // Limit each IP to 5 requests per window
  message: {
    error: "Too many avatar generation requests from this IP, please try again later.",
  },
  standardHeaders: true, // Include rate limit info in RateLimit-* response headers
  legacyHeaders: false, // Disable deprecated X-RateLimit-* headers
  keyGenerator: (req) => {
    // Extract client IP across proxies/load balancers for fair limiting
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           (req.headers['x-real-ip'] as string) ||
           (req.connection?.remoteAddress) ||
           (req.socket?.remoteAddress) ||
           'unknown';
  },
});

/**
 * Next.js API route handler for generating a character avatar image using OpenAI.
 * Accepts POST requests with a character name and returns an image URL or data URL.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
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
    // Move OpenAI client instantiation inside the handler for better error coverage
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    logEvent("info", "avatar_generate_start", "Avatar generation started", sanitizeLogMeta({ name: sanitizedName }));
    
    // Build dynamic DALL-E prompt using OpenAI with character analysis
    let prompt: string;
    try {
      logEvent("info", "avatar_dalle_prompt_start", "Generating DALL-E prompt via OpenAI");
      
      const textModel = getOpenAIModel("text");
      const promptGeneration = await openai.chat.completions.create({
        model: textModel,
        messages: [
          {
            role: "system",
            content: `You are an expert at creating DALL-E image prompts. Generate a detailed, single-character portrait prompt that avoids multiple people or duplicates. 

CRITICAL: If the character is a well-known person or fictional character, the description MUST accurately match their canonical/real appearance as closely as possible. Do not create generic descriptions - capture their actual likeness, distinctive features, and iconic appearance.`
          },
          {
            role: "user",
            content: `Create a DALL-E prompt for ${sanitizedName}.

${sanitizedName.toLowerCase().includes('original character') || sanitizedName.toLowerCase().includes('oc ') ? 'This is an original character - create a unique appearance.' : 'If this is a known character or real person, describe their canonical/actual appearance with specific distinctive features. Match their real likeness as closely as possible.'}

Return JSON with these fields:
- subject: detailed physical description matching their canonical/real appearance (200 chars max)
- artStyle: appropriate visual style for this character (50 chars max)
- composition: framing and pose guidance (100 chars max)
- iconicElements: signature props, clothing, or background elements specific to this character (100 chars max)
- negativePrompts: what to exclude to ensure single subject (150 chars max)
- gender: character's gender (for voice matching)`
          }
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: "json_object" }
      });

      const promptData = JSON.parse(promptGeneration.choices[0].message.content || "{}");
      
      // Extract gender for voice matching
      genderOut = promptData.gender || null;
      
      // Build prompt from structured data with emphasis on canonical likeness
      prompt = `Accurate likeness of ${sanitizedName}. ${promptData.subject || ""}. ${promptData.iconicElements || ""}. ${promptData.composition || ""}. Style: ${promptData.artStyle || "photorealistic"}. Match canonical appearance exactly. single, solo, alone, centered, close-up portrait, no other people. Exclude: ${promptData.negativePrompts || "multiple people, extra faces, duplicates"}`.trim();
      
      // Enforce max length
      if (prompt.length > 1000) {
        prompt = prompt.slice(0, 1000);
      }
      
      logEvent("info", "avatar_dalle_prompt_generated", "Generated DALL-E prompt", sanitizeLogMeta({ prompt, gender: genderOut }));
    } catch (promptErr) {
      logger.warn("Failed to generate dynamic DALL-E prompt, using fallback:", { error: promptErr });
      // Fallback to simple template with canonical likeness emphasis
      prompt = `Accurate likeness of ${sanitizedName}. Match their canonical/real appearance exactly. single, solo, alone, centered, close-up portrait, no other people, no duplicates.`;
      logEvent("info", "avatar_dalle_prompt_fallback", "Using fallback DALL-E prompt", sanitizeLogMeta({ prompt }));
    }

    const imageModels = getOpenAIModel("image");
    logEvent("info", "avatar_image_models", "Avatar image models selected", sanitizeLogMeta({
      primary: imageModels.primary,
      fallback: imageModels.fallback
    }));
    
    // Helper to get image from OpenAI, handling both URL and base64 (data URL) responses
    async function getOpenAIImage(model: string) {
      // Any `gpt-image-*` models (e.g. gpt-image-1, gpt-image-1.5) currently return
      // base64 (`b64_json`) and do not accept `response_format`, so treat them generically.
      const isGptImage = model.startsWith("gpt-image-");
      const params: OpenAIImageGenerateParams = {
        model,
        prompt: prompt,
        n: 1,
        size: "1024x1024"
      };
      // Only add response_format if the model supports it
      if (model === "dall-e-2" || model === "dall-e-3") {
        params.response_format = "url";
      }
      // Do NOT set response_format for gpt-image-* models (omit the property entirely)
      logEvent("info", "avatar_openai_image_call", "Calling OpenAI image generation", { model, params });
      const image = await openai.images.generate(params);
      logEvent("info", "avatar_openai_image_response", "OpenAI image API response", { model, response: image });
      if (isGptImage) {
        const b64 = image.data?.[0]?.b64_json;
        if (!b64) return null;
        // Return as data URL
        return `data:image/png;base64,${b64}`;
      } else {
        return image.data?.[0]?.url || null;
      }
    }
    // Only log the prompt/model at the start of image generation
    logEvent("info", "avatar_image_primary_attempt", "Attempting image generation with primary model", sanitizeLogMeta({ model: imageModels.primary, prompt }));
    let avatarUrl = null;
    let moderationBlocked = false;
    try {
      try {
        avatarUrl = await getOpenAIImage(imageModels.primary);
        logEvent("info", "avatar_image_primary_success", "Image generated successfully with primary model", sanitizeLogMeta({ model: imageModels.primary, avatarUrl }));
      } catch (err) {
        logEvent("error", "avatar_image_primary_error", "OpenAI image generation error (primary)", sanitizeLogMeta({ model: imageModels.primary, error: err instanceof Error ? err.message : String(err) }));
        // Moderation/safety error handling
        const errObj = (typeof err === 'object' && err !== null) ? err : {};
        const errCode = (errObj && 'code' in errObj) ? (errObj as unknown as { code?: string }).code : undefined;
        const errType = (errObj && 'type' in errObj) ? (errObj as unknown as { type?: string }).type : undefined;
        const errMsg = (errObj && 'message' in errObj) ? (errObj as unknown as { message?: string }).message : String(err);
        if (errCode === 'moderation_blocked' || errType === 'image_generation_user_error' || (errMsg && errMsg.includes('safety system'))) {
          logEvent("warn", "avatar_image_moderation_blocked", "OpenAI image generation blocked by moderation/safety system", sanitizeLogMeta({ model: imageModels.primary }));
          moderationBlocked = true;
        } else if (
          err &&
          typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof (err as { message?: unknown }).message === 'string' &&
          ((err as { message: string }).message).includes('must be verified to use the model')
        ) {
          const code =
            err &&
              typeof err === 'object' &&
              'status' in err
              ? (err as { status?: string }).status
              : err &&
                typeof err === 'object' &&
                'code' in err
                ? (err as { code?: string }).code
                : 'unknown';
          const msg = (err as { message?: string }).message || String(err);
          logEvent("warn", "avatar_image_model_unverified", "Model unavailable: organization not verified", sanitizeLogMeta({ model: imageModels.primary, code, msg }));
        } else {
          logEvent("warn", "avatar_image_primary_fallback", "Primary model unavailable, falling back", sanitizeLogMeta({ model: imageModels.primary, error: err instanceof Error ? err.message : String(err) }));
        }
      }
      if ((!avatarUrl && moderationBlocked) || (!avatarUrl)) {
        logEvent("info", "avatar_image_fallback_attempt", "Attempting image generation with fallback model", sanitizeLogMeta({ model: imageModels.fallback, prompt }));
        try {
          avatarUrl = await getOpenAIImage(imageModels.fallback);
          logEvent("info", "avatar_image_fallback_success", "Image generated successfully with fallback model", sanitizeLogMeta({ model: imageModels.fallback, avatarUrl }));
        } catch (err) {
          logEvent("error", "avatar_image_fallback_error", "OpenAI image generation error (fallback)", sanitizeLogMeta({ model: imageModels.fallback, error: err instanceof Error ? err.message : String(err) }));
          logEvent("warn", "avatar_image_fallback_failed", "Fallback image model also failed, using silhouette", sanitizeLogMeta({ model: imageModels.fallback, error: err instanceof Error ? err.message : String(err) }));
          res.status(200).json({ avatarUrl: "/silhouette.svg" });
          return;
        }
      }
      if (!avatarUrl) {
        logEvent("error", "avatar_image_none", "No image returned from OpenAI, using silhouette", sanitizeLogMeta({ model: imageModels.primary }));
        res.status(200).json({ avatarUrl: "/silhouette.svg", gender: genderOut });
        return;
      }
      // Only return the image URL or data URL to the client
      res.status(200).json({ avatarUrl, gender: genderOut });
      return;
    } catch (e) {
      logEvent("error", "avatar_unhandled_error", "Unhandled error in generate-avatar", sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }));
      res.status(200).json({ avatarUrl: "/silhouette.svg" });
      return;
    }
  } catch (e) {
    logEvent("error", "avatar_unhandled_error", "Unhandled error in generate-avatar", sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }));
    res.status(200).json({ avatarUrl: "/silhouette.svg" });
    return;
  }
}
