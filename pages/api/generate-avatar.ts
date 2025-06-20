// =============================
// pages/api/generate-avatar.ts
// Next.js API route for generating a character avatar image using OpenAI.
// Accepts POST requests with a character name and returns an image URL or data URL.
// =============================

import type { NextApiRequest, NextApiResponse } from "next";
import logger from "../../src/utils/logger";

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
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-4o",
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
          const parsed = JSON.parse(content);
          race = parsed.race || null;
          gender = parsed.gender || null;
          other = parsed.other || null;
          logger.info(`[AVATAR] Parsed description:`, { race, gender, other });
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

    let image, dallEUrl;
    let moderationBlocked = false;
    try {
      image = await openai.images.generate({
        model: "gpt-image-1",
        prompt: prompt,
        n: 1,
        size: "1024x1024"
      });
      dallEUrl = image.data?.[0]?.url;
    } catch (err) {
      // Moderation/safety error handling
      const errObj = (typeof err === 'object' && err !== null) ? err : {};
      const errCode = (errObj && 'code' in errObj) ? (errObj as unknown as { code?: string }).code : undefined;
      const errType = (errObj && 'type' in errObj) ? (errObj as unknown as { type?: string }).type : undefined;
      const errMsg = (errObj && 'message' in errObj) ? (errObj as unknown as { message?: string }).message : String(err);
      if (errCode === 'moderation_blocked' || errType === 'image_generation_user_error' || (errMsg && errMsg.includes('safety system'))) {
        logger.warn("OpenAI image generation blocked by moderation/safety system on gpt-image-1, trying dall-e-3");
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
        logger.warn(`gpt-image-1 unavailable: organization not verified (HTTP ${code}): ${msg}`);
      } else {
        logger.warn("gpt-image-1 unavailable, falling back to dall-e-3 (using model: dall-e-3)", err);
      }
    }
    if ((!dallEUrl && moderationBlocked) || (!dallEUrl && !image)) {
      // Try dall-e-3 if gpt-image-1 was blocked or failed
      try {
        image = await openai.images.generate({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          response_format: "url"
        });
        dallEUrl = image.data?.[0]?.url;
      } catch (err) {
        // If dall-e-3 also fails or is blocked, fallback to silhouette
        logger.warn("dall-e-3 also failed or was blocked, falling back to silhouette", err);
        return res.status(200).json({ avatarUrl: "/silhouette.svg" });
      }
    }
    if (!dallEUrl) {
      let imageMeta = undefined;
      let b64json = undefined;
      if (image && image.data && Array.isArray(image.data) && image.data[0]) {
        const d = image.data[0];
        imageMeta = {
          url: d.url,
          b64_json_preview: d.b64_json ? (d.b64_json.substring(0, 32) + '...') : undefined,
          b64_json_length: d.b64_json ? d.b64_json.length : undefined
        };
        b64json = d.b64_json;
      }
      if (b64json) {
        const dataUrl = `data:image/png;base64,${b64json}`;
        logger.info("Returning avatar as data URL from b64_json");
        return res.status(200).json({ avatarDataUrl: dataUrl });
      }
      logger.error("No image returned, falling back to silhouette", { imageMeta });
      return res.status(200).json({ avatarUrl: "/silhouette.svg" });
    }
    // Use dynamic import for node-fetch v2 in ESM
    const fetch = (await import("node-fetch")).default;
    try {
      const response = await fetch(dallEUrl);
      if (!response.ok) throw new Error("Failed to download avatar image");
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const contentType = response.headers.get("content-type") || "image/png";
      const dataUrl = `data:${contentType};base64,${base64}`;
      res.status(200).json({ avatarDataUrl: dataUrl });
    } catch (err) {
      logger.error("Avatar download failed:", err);
      // fallback to generic avatar (as a static URL)
      res.status(200).json({ avatarUrl: "/silhouette.svg" });
    }
  } catch (e) {
    logger.error("Avatar generation failed:", e);
    // fallback to generic avatar (as a static URL)
    res.status(200).json({ avatarUrl: "/silhouette.svg" });
  }
}
