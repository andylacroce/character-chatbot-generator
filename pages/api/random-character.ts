/**
 * API endpoint for generating random character names using OpenAI.
 * Maintains in-memory cache of recent names to avoid repetition.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getOpenAIModel } from "../../src/utils/openaiModelSelector";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Track recently generated names in memory to avoid repetition (resets on server restart)
const recentNames: string[] = [];
const MAX_RECENT_NAMES = 50;

/**
 * Next.js API route handler for generating a random character name using OpenAI.
 * Tracks recently generated names to improve variety.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    logEvent("warn", "random_character_method_not_allowed", "RandomCharacter API method not allowed", sanitizeLogMeta({
      method: req.method
    }));
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const model = getOpenAIModel("text");
    
    // Build exclusion list from recent names for better name variety
    const exclusionList = recentNames.length > 0 
      ? `Do NOT suggest any of these recently used names: ${recentNames.join(", ")}. `
      : "";
    
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a creative name generator for chatbots. Suggest WELL-KNOWN public domain characters from classic literature, mythology, folklore, and historical figures.

IMPORTANT GUARDRAILS:
- Only suggest characters that are firmly in the public domain (typically pre-1928 for US works)
- AVOID any character from modern media, movies, TV shows, video games, or comics created after 1928
- AVOID characters that are trademarked (e.g., Mickey Mouse, Superman, Harry Potter, Mario, Spider-Man)
- PREFER famous historical figures, classical mythology, ancient folklore, and classic literature
- Examples of GOOD choices: Sherlock Holmes, Dracula, Cleopatra, Julius Caesar, Zeus, King Arthur, Robin Hood, Odysseus, Joan of Arc, Leonardo da Vinci, Benjamin Franklin, Marie Curie, Abraham Lincoln, Confucius, Buddha, Socrates, Jane Austen, Edgar Allan Poe

Always provide just the character's name, nothing else.`
        },
        {
          role: "user",
          content: `${exclusionList}Suggest one well-known character name for a chatbot. Choose from:
- Classical mythology (Greek, Roman, Norse, Egyptian, etc.)
- Historical figures (scientists, leaders, philosophers, artists from any era before 1950)
- Classic literature published before 1928 (e.g., Sherlock Holmes, Dracula, Alice, Don Quixote)
- Folklore and fairy tales (e.g., Robin Hood, King Arthur, Aladdin)
- Ancient religious/philosophical figures (e.g., Confucius, Buddha, Socrates)

Prioritize famous, recognizable names that people will know. Reply ONLY with the name, no explanation.`
        }
      ],
      max_tokens: 20,
      temperature: 1.2,
    });

    const name = completion.choices[0]?.message?.content?.trim().replace(/^"|"$/g, "") || "Sherlock Holmes";
    
    // Track generated name and maintain max recent names list
    if (!recentNames.includes(name)) {
      recentNames.push(name);
      if (recentNames.length > MAX_RECENT_NAMES) {
        recentNames.shift(); // Remove oldest name when list reaches max size
      }
    }
    
    logEvent("info", "random_character_generated", "Random character generated", sanitizeLogMeta({ 
      name,
      recentNamesCount: recentNames.length
    }));
    res.status(200).json({ name });
  } catch (err) {
    logEvent("error", "random_character_failed", "Failed to generate random character", sanitizeLogMeta({
      error: err instanceof Error ? err.message : String(err)
    }));
    // Return default fallback on any error
    res.status(200).json({ name: "Sherlock Holmes" });
  }
}
