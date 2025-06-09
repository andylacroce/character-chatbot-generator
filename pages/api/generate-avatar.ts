import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    // 1. Get a factual, visual description for the image prompt
    const descriptionPrompt = `Describe what ${name} looks like in a single, vivid sentence for an artist. If you don't know, say so.`;
    const descriptionCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: descriptionPrompt },
      ],
      max_tokens: 80,
      temperature: 0.2,
    });
    const description = descriptionCompletion.choices[0]?.message?.content?.trim() || "";
    let imagePrompt;
    if (description && !/don't know|no information|not sure|unknown|I'm not sure|I do not know|I have no information/i.test(description)) {
      imagePrompt = `A high-quality, photorealistic portrait of ${name}. ${description} Upper body, facing forward, studio lighting, plain background.`;
    } else {
      imagePrompt = `A high-quality, photorealistic portrait of ${name}, upper body, facing forward, studio lighting, plain background.`;
    }
    const image = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024", // updated to supported size
      response_format: "url",
    });
    const dallEUrl = image.data?.[0]?.url;
    if (!dallEUrl) return res.status(500).json({ error: "No image returned" });
    const avatarsDir = path.join(process.cwd(), "public", "avatars");
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
    const filename = `${sanitizeFilename(name)}-${Date.now()}.png`;
    const filePath = path.join(avatarsDir, filename);
    const localUrl = `/avatars/${filename}`;
    // Use dynamic import for node-fetch v2 in ESM
    const fetch = (await import("node-fetch")).default;
    try {
      const response = await fetch(dallEUrl);
      if (!response.ok) throw new Error("Failed to download avatar image");
      const buffer = await response.buffer();
      fs.writeFileSync(filePath, buffer);
      res.status(200).json({ avatarUrl: localUrl });
    } catch (err) {
      console.error("Avatar download failed:", err);
      // fallback to default avatar
      res.status(200).json({ avatarUrl: "/gandalf.jpg" });
    }
  } catch (e) {
    console.error("Avatar generation failed:", e);
    res.status(500).json({ error: "Failed to generate avatar." });
  }
}
