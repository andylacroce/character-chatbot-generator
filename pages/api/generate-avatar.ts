import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import logger from "../../src/utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    // 1. Get a factual, richly detailed visual description for the image prompt
    const descriptionPrompt = `Imagine you are briefing a world-class portrait artist or a visual AI. Before you begin, imagine you are looking at a set of high-resolution reference photos, film stills, or iconic images of ${name} (if they exist). Use these reference images in your memory or training data as the basis for your description. Describe in extremely vivid, specific detail what ${name} looks like. Write a very long, highly detailed response—at least 1000 words if possible. Do not summarize; elaborate on every feature and detail. Break down the description by:
- Facial features (forehead, brows, eyes, nose, mouth, jaw, chin, ears, skin texture, facial hair, distinguishing marks)
- Hair (color, style, length, part, texture)
- Eyes (color, shape, gaze, expression)
- Skin tone and complexion
- Age, ethnicity, and gender presentation
- Body type, posture, and typical pose
- Clothing and accessories (be specific, mention brands, styles, or signature items if known)
- Expression, mood, and emotional tone
- Any iconic items, props, or settings
- Lighting, background, and overall style
If the character is real or famous, explicitly reference specific photos, movie scenes, or public appearances and describe what you see in those images. If fictional, be imaginative and genre-appropriate. Make the description so detailed that an artist could create a highly accurate, recognizable portrait. If you don't know, say so.`;
    logger.info(`[AVATAR] Generating description for '${name}' with prompt: ${descriptionPrompt}`);
    const descriptionCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: descriptionPrompt },
      ],
      max_tokens: 1800, // Increased to allow for ~1000 words
      temperature: 0.15,
    });
    const description = descriptionCompletion.choices[0]?.message?.content?.trim() || "";
    logger.info(`[AVATAR] Description for '${name}': ${description}`);
    // DALL-E prompt limit: keep under 1000 chars for safety
    let conciseDescription = description.replace(/\s+/g, ' ').trim();
    // Try to prioritize visually distinctive features if truncating
    const featurePriority = [
      /facial features/i,
      /hair/i,
      /eyes/i,
      /clothing/i,
      /expression/i
    ];
    let prioritized = '';
    for (const regex of featurePriority) {
      const match = conciseDescription.match(new RegExp(`(${regex.source}[^.]+\.)`, 'i'));
      if (match) prioritized += match[1] + ' ';
    }
    if (prioritized.length > 0) {
      conciseDescription = (prioritized + conciseDescription).slice(0, 700) + '...';
    } else if (conciseDescription.length > 700) {
      conciseDescription = conciseDescription.slice(0, 700) + '...';
    }
    let imagePrompt;
    if (conciseDescription && !/don't know|no information|not sure|unknown|I'm not sure|I do not know|I have no information/i.test(conciseDescription)) {
      imagePrompt = `A high-quality, photorealistic portrait of ${name}. (If ${name} is real or famous, use actual reference photos, film stills, or renderings of ${name} to ensure the most accurate likeness possible. Study these images closely and base the portrait on them. Match the likeness as closely as possible to well-known photos or portraits.) ${conciseDescription} Upper body, facing forward, studio lighting, plain background.`;
      // Truncate to 1000 chars for DALL-E
      if (imagePrompt.length > 1000) imagePrompt = imagePrompt.slice(0, 997) + '...';
    } else {
      imagePrompt = `A high-quality, photorealistic portrait of ${name}, upper body, facing forward, studio lighting, plain background.`;
    }
    logger.info(`[AVATAR] Image prompt for '${name}': ${imagePrompt}`);
    const image = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });
    const dallEUrl = image.data?.[0]?.url;
    if (!dallEUrl) return res.status(500).json({ error: "No image returned" });
    // Use dynamic import for node-fetch v2 in ESM
    const fetch = (await import("node-fetch")).default;
    try {
      const response = await fetch(dallEUrl);
      if (!response.ok) throw new Error("Failed to download avatar image");
      const buffer = await response.buffer();
      const base64 = buffer.toString("base64");
      const contentType = response.headers.get("content-type") || "image/png";
      const dataUrl = `data:${contentType};base64,${base64}`;
      res.status(200).json({ avatarDataUrl: dataUrl });
    } catch (err) {
      logger.error("Avatar download failed:", err);
      // fallback to default avatar (as a static URL)
      res.status(200).json({ avatarUrl: "/gandalf.jpg" });
    }
  } catch (e) {
    logger.error("Avatar generation failed:", e);
    res.status(500).json({ error: "Failed to generate avatar." });
  }
}
