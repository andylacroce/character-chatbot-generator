import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import logger from "../../src/utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    // 1. Get a concise, visually focused description for the image prompt
    const descriptionPrompt = `Describe in vivid, specific visual detail what ${name} looks like for the purpose of generating an accurate portrait. Focus on facial features, hair, eyes, skin, expression, clothing, and any iconic items. Be concise but richly descriptive. If ${name} is real or famous, base your description on well-known photos, film stills, or reference images. If fictional, be imaginative and genre-appropriate. Do not summarize, but do not exceed 3-5 sentences.`;
    logger.info(`[AVATAR] Generating description for '${name}' with prompt: ${descriptionPrompt}`);
    const descriptionCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: descriptionPrompt },
      ],
      max_tokens: 400, // Shorter, concise
      temperature: 0.2,
    });
    const description = descriptionCompletion.choices[0]?.message?.content?.trim() || "";
    logger.info(`[AVATAR] Description for '${name}': ${description}`);
    // Compose the DALL-E prompt
    let imagePrompt =
      `A high-quality, photorealistic portrait of ${name}. ` +
      `(If ${name} is real or famous, use actual reference photos, film stills, or renderings of ${name} to ensure the most accurate likeness possible. ` +
      `Refer to images, likenesses, and visual memory for maximum accuracy. ` +
      `Match the likeness as closely as possible to well-known photos or portraits.) ` +
      `${description}`;
    // Truncate to 1000 chars for DALL-E
    if (imagePrompt.length > 1000) imagePrompt = imagePrompt.slice(0, 997) + '...';
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
