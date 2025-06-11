import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { CHARACTER_VOICE_MAP } from "../../src/utils/characterVoices";
import logger, { generateRequestId } from "../../src/utils/logger";

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
  } catch {
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
  const requestId = req.headers["x-request-id"] || generateRequestId();

  // Aggressive anti-caching headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('ETag', Math.random().toString(36).slice(2)); // Random ETag to defeat cache

  if (req.method !== "GET") {
    logger.info(`[RandomCharacter API] 405 Method Not Allowed for ${req.method} | requestId=${requestId}`);
    res.status(405).json({ error: "Method not allowed", requestId });
    return;
  }

  // Accept exclusions from query param (future extensibility)
  let exclude: string[] = [];
  if (typeof req.query.exclude === "string") {
    exclude = req.query.exclude.split(",").map(s => s.trim());
  } else if (Array.isArray(req.query.exclude)) {
    exclude = req.query.exclude.flatMap(s => s.split(",").map(x => x.trim()));
  }

  try {
    // Exclude Sherlock Holmes and last 5 static names from OpenAI
    const staticList = getStaticCharacterList();
    const lastFew = staticList.slice(-5);
    const exclusions = ["Sherlock Holmes", ...lastFew, ...exclude];
    const exclusionStr = exclusions.map(n => `"${n}"`).join(", ");
    const prompt = `Suggest the name of a real, well-known character from history, literature, film, TV, comics, or pop culture. Reply ONLY with the character's name, no description or extra text. Do NOT pick any of the following: ${exclusionStr}. Pick a different character each time. Avoid repeating any character you've suggested recently. Be creative and vary the genres, time periods, and backgrounds. Prioritize diversity and randomness.`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant. Always pick a different, random, and diverse character each time. Avoid repeating any character you've suggested recently. Vary genres, time periods, and backgrounds. Prioritize creativity, diversity, and randomness in your choices." },
        { role: "user", content: prompt },
      ],
      max_tokens: 32,
      temperature: 1.7,
    });
    const name = completion.choices[0]?.message?.content?.trim().replace(/^"|"$/g, "");
    // Validate the name: must be 2+ chars, not just numbers, not contain forbidden chars, not look like junk
    const isValidName = (n: string | undefined) => {
      if (!n) return false;
      if (n.length < 2) return false;
      if (/[^\w\s\-'.]/.test(n)) return false; // no weird symbols
      if (/\d{3,}/.test(n)) return false; // not just numbers
      if (/^(?:[aA-zZ]{1,2})$/.test(n)) return false; // not just a single letter or two
      if (/^(unknown|n[\\/]?a|none|null|character|random|test)$/i.test(n.trim())) return false;
      return true;
    };
    if (!isValidName(name)) throw new Error("Invalid or junk character name returned");
    logger.info(`[RandomCharacter API] 200 OK: [OPENAI] ${name} | requestId=${requestId}`);
    await logRandomCharacter(`[OPENAI] ${name}`);
    res.status(200).json({ name, requestId });
  } catch {
    const fallback = getRandomStaticCharacter(exclude);
    logger.error(`[RandomCharacter API] OpenAI error | requestId=${requestId}`);
    logger.info(`[RandomCharacter API] 500 Fallback: [FALLBACK] ${fallback} | requestId=${requestId}`);
    await logRandomCharacter(`[FALLBACK] ${fallback}`);
    res.status(500).json({ error: "Failed to get random character", name: fallback, requestId });
  }
}
