// =============================
// pages/api/random-character.ts
// Next.js API route for generating or selecting a random character name.
// Uses OpenAI or static list for suggestions, logs results for analytics.
// =============================

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
  // Combine CHARACTER_VOICE_MAP keys (excluding "Default") with extraStatic for fallback
  return [...Object.keys(CHARACTER_VOICE_MAP).filter(n => n !== "Default"),
    "Cleopatra", "Nikola Tesla", "Harriet Tubman", "Bruce Lee", "Ada Lovelace", "Mahatma Gandhi", "Queen Elizabeth I", "Martin Luther King Jr.",
    "Frida Kahlo", "Leonardo da Vinci", "Marie Curie", "Nelson Mandela", "Joan of Arc", "Socrates", "Jane Austen", "Malala Yousafzai", "David Bowie",
    "Serena Williams", "Albert Einstein", "Winston Churchill", "Rosa Parks", "Stephen Hawking", "Amelia Earhart", "Simone Biles", "Oscar Wilde"
  ];
}

function getRandomStaticCharacter(exclude: string[] = []) {
  const all = getStaticCharacterList().filter(n => !exclude.includes(n));
  if (all.length === 0) return "Yoda";
  return all[Math.floor(Math.random() * all.length)];
}

/**
 * Next.js API route handler for generating or selecting a random character name.
 * Uses OpenAI or static list for suggestions, logs results for analytics.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
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
    exclude = req.query.exclude.split(",").map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(req.query.exclude)) {
    exclude = req.query.exclude.flatMap(s => s.split(",").map(x => x.trim())).filter(Boolean);
  }

  try {
    const staticList = getStaticCharacterList();
    // Exclude Sherlock Holmes and last 5 static names from OpenAI
    const lastFew = staticList.slice(-5);
    const exclusions = ["Sherlock Holmes", ...lastFew, ...exclude];
    const exclusionStr = exclusions.map(n => `"${n}"`).join(", ");
    const prompt = `### INSTRUCTIONS
You are an expert in world history, literature, pop culture, and media. Your task is to suggest the name of a real, well-known character from history, literature, film, TV, comics, or pop culture. Follow these rules:
- Reply ONLY with the character's name. Do not include any description, explanation, or extra text.
- Do NOT pick any of the following: ${exclusionStr}.
- Do NOT pick any character that is too similar to those listed above, or that you have suggested recently.
- Each time, pick a character from a different genre, time period, country, or background than those recently suggested.
- Prioritize diversity: vary gender, culture, time period, and genre.
- Avoid repeats, near-duplicates, or generic names.
- Think carefully and take your time to select a truly unique and interesting character.
- Examples of good answers: "Cleopatra", "Sherlock Holmes", "Frida Kahlo", "Bruce Lee", "Marie Curie", "David Bowie", "Joan of Arc", "Simone Biles", "Oscar Wilde".
- Output format: Only the character's name, nothing else.
### END INSTRUCTIONS`;
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
    // Enhanced validation: filter out junk, forbidden, or near-duplicate names
    const isValidName = (n: string | undefined) => {
      if (!n) return false;
      if (n.length < 2) return false;
      // Restrict to printable ASCII, letters, numbers, spaces, hyphens, apostrophes, and periods
      if (/[^A-Za-z0-9\s\-'.]/.test(n)) return false; // no weird symbols or non-latin
      if (/\d{3,}/.test(n)) return false; // not just numbers
      if (/^[A-Za-z]{1,2}$/.test(n)) return false; // not just a single letter or two
      if (/(unknown|n[\\/]?a|none|null|character|random|test)/i.test(n.trim())) return false;
      if (exclude.some(e => n.toLowerCase() === e.toLowerCase())) return false;
      // Avoid near-duplicates (case-insensitive, ignore spaces)
      if (exclude.some(e => n.replace(/\s+/g, '').toLowerCase() === e.replace(/\s+/g, '').toLowerCase())) return false;
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
