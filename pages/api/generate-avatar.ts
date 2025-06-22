// =============================
// pages/api/generate-avatar.ts
// Next.js API route for generating a character avatar image using OpenAI.
// Accepts POST requests with a character name and returns an image URL or data URL.
// =============================

import type { NextApiRequest, NextApiResponse } from "next";
import logger from "../../src/utils/logger";
import { getOpenAIModel } from "../../src/utils/openaiModelSelector";
import type { OpenAIImageGenerateParams } from "../../src/types/openai-image";

/**
 * Next.js API route handler for generating a character avatar image using OpenAI.
 * Accepts POST requests with a character name and returns an image URL or data URL.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  let genderOut: string | null = null;
  try {
    // Move OpenAI client instantiation inside the handler for better error coverage
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    logger.info(`[AVATAR] Generating avatar for: ${name}`);
    // Use OpenAI GPT to get a detailed, attribute-rich description
    let race = null;
    let gender = null;
    let other = null;
    try {
      const textModel = getOpenAIModel("text");
      logger.info(`[AVATAR] Using GPT model: ${textModel}`);
      const gptResponse = await openai.chat.completions.create({
        model: textModel,
        messages: [
          {
            role: "system",
            content: "You are an assistant that provides concise, factual, and explicit physical descriptions of people or fictional characters in JSON format. Respond ONLY with a JSON object with keys: race, gender, other. 'other' should be a brief, distinguishing description (e.g. hair, style, notable features, profession, etc). If unknown, use 'unknown'. Example: {\"race\":\"Black\",\"gender\":\"male\",\"other\":\"colorful hair, facial piercings, tattoos, flamboyant style, former NBA player\"}"
          },
          {
            role: "user",
            content: `Describe ${name} with keys: race, gender, other.`
          }
        ],
        max_tokens: 100,
        temperature: 0.2
      });
      const content = gptResponse.choices?.[0]?.message?.content?.trim() || null;
      if (content) {
        logger.info(`[AVATAR] GPT response: ${content}`);
        try {
          // Strip code fences and markdown if present
          const cleaned = content.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
          const parsed = JSON.parse(cleaned);
          race = parsed.race || null;
          gender = parsed.gender || null;
          other = parsed.other || null;
          logger.info(`[AVATAR] Parsed description:`, { race, gender, other });
          genderOut = gender;
        } catch (jsonErr) {
          logger.warn("Failed to parse GPT JSON:", jsonErr, content);
        }
      } else {
        logger.info(`[AVATAR] GPT response: <empty>`);
      }
    } catch (descErr) {
      logger.warn("Failed to get description from OpenAI:", descErr);
    }
    // Build the likenessRef for DALL-E
    let likenessRef = null;
    if (race && gender && other && race !== "unknown" && gender !== "unknown" && other !== "unknown") {
      likenessRef = `Depict: ${name}, a ${race} ${gender}. ${other}.`;
    } else {
      likenessRef = `Accurately depict the real or canonical appearance of ${name} as seen in reference images.`;
    }
    // Stronger negative and positive modifiers to avoid multiple depictions
    const soloModifiers = "single, solo, alone, isolated, only one subject, no background distractions, centered, close-up portrait, no other people, no duplicates, no reflections, no shadows, no group shots, no collage, no split frames, no multiple versions, no background elements that resemble other characters.";
    const styleInstruction = `If ${name} is a cartoon, animated, or illustrated character, use a matching art style. Otherwise, use a photorealistic style.`;
    const singleInstruction = `Create a single, centered, close-up portrait of only ${name}. ${soloModifiers}`;
    const negativePrompt = `Exclude: multiple people, extra faces, group shots, duplicate figures, reflections, shadows of other people, collage, split frames, or any representation of more than one version of ${name}.`;

    // Assemble prompt in order of importance
    const maxPromptLength = 1000;
    const base = `Ultra-detailed portrait of ${name}. `;
    let prompt = base;
    // Add likenessRef (subject description) first, up to 350 chars
    const likenessMax = 350;
    const likeness = likenessRef.slice(0, likenessMax);
    prompt += likeness + ' ';
    // Add styleInstruction, up to 120 chars
    const styleMax = 120;
    const style = styleInstruction.slice(0, styleMax);
    prompt += style + ' ';
    // Add singleInstruction, up to 200 chars
    const singleMax = 200;
    const single = singleInstruction.slice(0, singleMax);
    prompt += single + ' ';
    // Add negativePrompt, up to 250 chars
    const negativeMax = 250;
    const negative = negativePrompt.slice(0, negativeMax);
    prompt += negative;
    // If still too long, trim from the end (modifiers/negatives first)
    if (prompt.length > maxPromptLength) {
      // Remove negativePrompt first
      prompt = prompt.replace(negative, '');
      if (prompt.length > maxPromptLength) {
        // Remove singleInstruction next
        prompt = prompt.replace(single, '');
        if (prompt.length > maxPromptLength) {
          // Remove styleInstruction next
          prompt = prompt.replace(style, '');
          if (prompt.length > maxPromptLength) {
            // Finally, trim likenessRef as last resort
            prompt = base + likenessRef.slice(0, maxPromptLength - base.length);
          }
        }
      }
    }
    prompt = prompt.trim();
    logger.info(`[AVATAR] Final Image prompt for DALL-E: ${prompt}`);

    const imageModels = getOpenAIModel("image");
    logger.info(`[AVATAR] Image generation models selected: primary='${imageModels.primary}', fallback='${imageModels.fallback}'`);
    // Helper to get image from OpenAI, handling both URL and base64 (data URL) responses
    async function getOpenAIImage(model: string) {
      // gpt-image-1 only supports base64 (b64_json), not URL
      const isGptImage1 = model === "gpt-image-1";
      const params: OpenAIImageGenerateParams = {
        model,
        prompt: prompt,
        n: 1,
        size: "1024x1024"
      };
      if (!isGptImage1) {
        params.response_format = "url";
      } else {
        params.response_format = "b64_json";
      }
      const image = await openai.images.generate(params);
      if (isGptImage1) {
        const b64 = image.data?.[0]?.b64_json;
        if (!b64) return null;
        // Return as data URL
        return `data:image/png;base64,${b64}`;
      } else {
        return image.data?.[0]?.url || null;
      }
    }
    let avatarUrl = null;
    let moderationBlocked = false;
    try {
      logger.info(`[AVATAR] Attempting image generation with primary model: '${imageModels.primary}'`, { prompt });
      try {
        avatarUrl = await getOpenAIImage(imageModels.primary);
        logger.info(`[AVATAR] Image generated successfully with model: '${imageModels.primary}'`, { avatarUrl });
      } catch (err) {
        logger.error(`[AVATAR] Error from OpenAI image generation (primary model: '${imageModels.primary}')`, { error: err });
        // Moderation/safety error handling
        const errObj = (typeof err === 'object' && err !== null) ? err : {};
        const errCode = (errObj && 'code' in errObj) ? (errObj as unknown as { code?: string }).code : undefined;
        const errType = (errObj && 'type' in errObj) ? (errObj as unknown as { type?: string }).type : undefined;
        const errMsg = (errObj && 'message' in errObj) ? (errObj as unknown as { message?: string }).message : String(err);
        if (errCode === 'moderation_blocked' || errType === 'image_generation_user_error' || (errMsg && errMsg.includes('safety system'))) {
          logger.warn(`[AVATAR] OpenAI image generation blocked by moderation/safety system on model '${imageModels.primary}', will try fallback model '${imageModels.fallback}'`);
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
          logger.warn(`[AVATAR] Model '${imageModels.primary}' unavailable: organization not verified (HTTP ${code}): ${msg}`);
        } else {
          logger.warn(`[AVATAR] Model '${imageModels.primary}' unavailable, falling back to '${imageModels.fallback}'`, err);
        }
      }
      if ((!avatarUrl && moderationBlocked) || (!avatarUrl)) {
        logger.info(`[AVATAR] Attempting image generation with fallback model: '${imageModels.fallback}'`, { prompt });
        try {
          avatarUrl = await getOpenAIImage(imageModels.fallback);
          logger.info(`[AVATAR] Image generated successfully with fallback model: '${imageModels.fallback}'`, { avatarUrl });
        } catch (err) {
          logger.error(`[AVATAR] Error from OpenAI image generation (fallback model: '${imageModels.fallback}')`, { error: err });
          logger.warn(`[AVATAR] Fallback image model '${imageModels.fallback}' also failed or was blocked, falling back to silhouette`, err);
          return res.status(200).json({ avatarUrl: "/silhouette.svg" });
        }
      }
      if (!avatarUrl) {
        logger.error("No image returned from OpenAI, falling back to silhouette");
        return res.status(200).json({ avatarUrl: "/silhouette.svg", gender: genderOut });
      }
      // Only return the image URL or data URL to the client
      return res.status(200).json({ avatarUrl, gender: genderOut });
    } catch (e) {
      logger.error("[AVATAR] Unhandled error in generate-avatar:", e);
      return res.status(200).json({ avatarUrl: "/silhouette.svg" });
    }
  } catch (e) {
    logger.error("[AVATAR] Unhandled error in generate-avatar:", e);
    return res.status(200).json({ avatarUrl: "/silhouette.svg" });
  }
}
