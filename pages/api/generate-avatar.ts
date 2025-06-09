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
    const descriptionPrompt = `Describe in vivid, specific detail what ${name} looks like for a portrait artist. Include facial features, hair, eyes, skin tone, age, ethnicity, clothing, expression, and any iconic items or accessories. Add any unique or memorable traits, style, or mood that would make the portrait instantly recognizable as this character. If the character is fictional or fantastical, include imaginative or genre-appropriate elements. Be as descriptive, creative, and accurate as possible. If you don't know, say so.`;
    logger.info(`[AVATAR] Generating description for '${name}' with prompt: ${descriptionPrompt}`);
    const descriptionCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: descriptionPrompt },
      ],
      max_tokens: 180,
      temperature: 0.2,
    });
    const description = descriptionCompletion.choices[0]?.message?.content?.trim() || "";
    logger.info(`[AVATAR] Description for '${name}': ${description}`);
    let imagePrompt;
    if (description && !/don't know|no information|not sure|unknown|I'm not sure|I do not know|I have no information/i.test(description)) {
      imagePrompt = `A high-quality, photorealistic portrait of ${name}. ${description} Upper body, facing forward, studio lighting, plain background.`;
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
