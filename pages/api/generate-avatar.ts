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
    const originalDescriptionFromAPI = descriptionCompletion.choices[0]?.message?.content?.trim() || "";
    let description = originalDescriptionFromAPI;
    logger.info(`[AVATAR] Initial description for '${name}': ${description}`);

    const isGenericResponse =
      !description || // Handle empty description
      description.includes("don't have any specific information") ||
      description.includes("need more context") ||
      description.includes("need more details") ||
      description.toLowerCase().startsWith("i'm sorry, but i") ||
      description.toLowerCase().startsWith("i am unable to provide") ||
      description.toLowerCase().startsWith("i do not have enough information");

    if (isGenericResponse) {
      logger.info(
        `[AVATAR] Initial description for '${name}' was generic or empty. Attempting to generate a random interesting one.`
      );
      const randomDescriptionPrompt = `Generate a concise (3-5 sentences) and vivid visual description of a completely random, unique, and interesting fictional character, suitable for an AI image generator to create a portrait. This character should not be based on any existing known figures. Focus on distinct facial features (e.g., sharp nose, kind eyes with an unusual color), hair (e.g., vibrant green dreadlocks, shimmering silver braids), skin tone/texture (e.g., iridescent scales, smooth ebony), typical expression (e.g., a knowing smirk, serene contemplation), style of clothing (e.g., ornate space armor, tattered post-apocalyptic gear, elegant elven robes), and one or two iconic or unusual items they might possess (e.g., a staff that hums with power, a pair of goggles that see through time, a miniature dragon perched on their shoulder). Make the description imaginative and visually detailed.`;

      try {
        const randomDescriptionCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a highly creative assistant specializing in inventing unique and visually rich character descriptions for artists.",
            },
            { role: "user", content: randomDescriptionPrompt },
          ],
          max_tokens: 400,
          temperature: 0.7, // Higher temperature for more creativity
        });
        const newDescription = randomDescriptionCompletion.choices[0]?.message?.content?.trim();
        if (newDescription) {
          description = newDescription;
          logger.info(`[AVATAR] Successfully generated random description: ${description}`);
        } else {
          logger.warn(
            `[AVATAR] Failed to generate a random description. Proceeding with the original (potentially generic or empty) one.`
          );
        }
      } catch (randomGenError) {
        logger.error("[AVATAR] Error generating random description:", randomGenError);
        logger.warn(
          `[AVATAR] Proceeding with the original (potentially generic or empty) description after error.`
        );
      }
    }

    // Compose the DALL-E prompt
    let imagePrompt;

    if (isGenericResponse && description && description !== originalDescriptionFromAPI) {
      // A new random description was successfully generated and is different from the original
      logger.info(`[AVATAR] Using randomly generated description for image prompt.`);
      imagePrompt =
        `A high-quality, highly detailed fantasy or sci-fi portrait of a unique, imaginative character based on the following description. ` +
        `The style should be artistically appropriate to the described character (e.g., fantasy art, sci-fi concept art, whimsical illustration). Be creative and visually rich. ` +
        `${description}`;
    } else {
      // Use the original name and description
      logger.info(`[AVATAR] Using original name and description for image prompt for '${name}'.`);
      imagePrompt =
        `A high-quality, highly accurate depiction of ${name}. ` + // Changed 'portrait' to 'depiction'
        `If ${name} is primarily known as a cartoon, animated, or illustrated character, the style MUST be a matching art style (e.g., cartoon, 2D animation, 3D animation, comic book art, illustration). ` +
        `Otherwise, for any character that is not explicitly cartoonish/animated (including real people, famous individuals, or other fictional characters), the portrait MUST be photorealistic, resembling a high-resolution photograph with realistic lighting, textures, and details. If ${name} is a real or famous person, ensure the likeness is as close as possible to well-known photographs or official depictions (do a lot of research!). ` +
        `${description}`;
    }

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
