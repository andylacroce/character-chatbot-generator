import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import logger from "../../src/utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    // Compose the DALL-E prompt directly with the name and style instructions
    let imagePrompt =
      `A single, focused, high-quality, highly accurate depiction of ${name}. ` + // Added "A single, focused" to emphasize one subject
      `If ${name} is primarily known as a cartoon, animated, or illustrated character, the style MUST be a matching art style (e.g., cartoon, 2D animation, 3D animation, comic book art, illustration). ` +
      `Otherwise, for any character that is not explicitly cartoonish/animated (including real people, famous individuals, or other fictional characters), the portrait MUST be photorealistic, resembling a high-resolution photograph with realistic lighting, textures, and details. If ${name} is a real or famous person, ensure the likeness is as close as possible to well-known photographs or official depictions (do a lot of research, using many reference images!). `;

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
