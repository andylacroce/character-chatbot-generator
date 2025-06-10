import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { CHARACTER_VOICE_MAP } from "../../src/utils/characterVoices";
import logger from "../../src/utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function logRandomCharacter(name: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/log-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: '[Randomizer]',
        text: `Random character: ${name}`,
        sessionId: 'randomizer',
        sessionDatetime: new Date().toISOString(),
      })
    });
  } catch (e) {
    // Ignore logging errors
  }
}

function getStaticCharacterList() {
  return Object.keys(CHARACTER_VOICE_MAP).filter(n => n !== "Default");
}

function getRandomStaticCharacter(exclude: string[] = []) {
  const all = getStaticCharacterList().filter(n => !exclude.includes(n));
  if (all.length === 0) return "Yoda";
  return all[Math.floor(Math.random() * all.length)];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Aggressive anti-caching headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('ETag', Math.random().toString(36).slice(2)); // Random ETag to defeat cache

  if (req.method !== "GET") {
    logger.info(`[RandomCharacter API] 405 Method Not Allowed for ${req.method}`);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Accept exclusions from query param (future extensibility)
  let exclude: string[] = [];
  if (typeof req.query.exclude === "string") {
    exclude = req.query.exclude.split(",").map(s => s.trim());
  } else if (Array.isArray(req.query.exclude)) {
    exclude = req.query.exclude.flatMap(s => s.split(",").map(x => x.trim()));
  }

  // 50% chance to use OpenAI, 50% static
  const useOpenAI = Math.random() < 0.5;
  if (!useOpenAI) {
    const staticName = getRandomStaticCharacter(exclude);
    logger.info(`[RandomCharacter API] 200 OK: [STATIC] ${staticName}`);
    await logRandomCharacter(`[STATIC] ${staticName}`);
    res.status(200).json({ name: staticName });
    return;
  }

  try {
    // Exclude Sherlock Holmes and last 5 static names from OpenAI
    const staticList = getStaticCharacterList();
    const lastFew = staticList.slice(-5);
    const exclusions = ["Sherlock Holmes", ...lastFew, ...exclude];
    const exclusionStr = exclusions.map(n => `"${n}"`).join(", ");
    const prompt = `Suggest the name of a real, well-known character from history, literature, film, TV, comics, or pop culture. Reply ONLY with the character's name, no description or extra text. Do NOT pick any of the following: ${exclusionStr}. Pick a different character each time.`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant. Always pick a different character each time, and avoid repeating the last few you suggested." },
        { role: "user", content: prompt },
      ],
      max_tokens: 32,
      temperature: 1.5,
    });
    const name = completion.choices[0]?.message?.content?.trim().replace(/^"|"$/g, "");
    if (!name) throw new Error("No character name returned");
    logger.info(`[RandomCharacter API] 200 OK: [OPENAI] ${name}`);
    await logRandomCharacter(`[OPENAI] ${name}`);
    res.status(200).json({ name });
  } catch (e: any) {
    const fallback = getRandomStaticCharacter(exclude);
    logger.error(`[RandomCharacter API] OpenAI error: ${e?.message || e}`);
    logger.info(`[RandomCharacter API] 500 Fallback: [FALLBACK] ${fallback}`);
    await logRandomCharacter(`[FALLBACK] ${fallback}`);
    res.status(500).json({ error: e.message || "Failed to get random character", name: fallback });
  }
}
