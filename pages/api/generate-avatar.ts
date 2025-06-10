import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import logger from "../../src/utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    logger.info(`[AVATAR] Generating avatar for: ${name}`);
    // Compose the DALL-E prompt using only the name
    let likenessRef = `True to their appearance in reference images of ${name}.`;
    let styleInstruction = `If ${name} is a cartoon, animated, or illustrated character, use a matching art style. Otherwise, use a photorealistic style.`;
    let singleInstruction = `Only show a single, centered portrait of ${name}. Do not include multiple figures, duplicates, or more than one version of the character in the same image. No split frames, no collage, no group shots.`;
    let imagePrompt = `Portrait of ${name}. ${likenessRef} ${styleInstruction} ${singleInstruction} Expressive, detailed, and true to their personality.`;

    // Truncate to 1000 chars for DALL-E
    if (imagePrompt.length > 1000) imagePrompt = imagePrompt.slice(0, 997) + '...';
    logger.info(`[AVATAR] Final Image prompt for DALL-E: ${imagePrompt}`);

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
      // fallback to generic avatar (as a static URL)
      res.status(200).json({ avatarUrl: "/silhouette.svg" });
    }
  } catch (e) {
    logger.error("Avatar generation failed:", e);
    res.status(500).json({ error: "Failed to generate avatar." });
  }
}
