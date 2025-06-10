import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import logger from "../../src/utils/logger"; // Import logger

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const USE_DETAILED_PERSONALITY = false; // Toggle for detailed summary

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name: originalName } = req.body; // Renamed for clarity
  if (!originalName) return res.status(400).json({ error: "Name required" });
  logger.info(`[PERSONALITY] Received request to generate personality for original name: ${originalName}`);

  if (!USE_DETAILED_PERSONALITY) {
    logger.info(`[PERSONALITY] Skipping detailed summary. Using concise prompt for '${originalName}'.`);
    const concisePrompt = `You are ${originalName}. Always respond in character, using your unique style, knowledge, and quirks. Use your internal knowledge. Never break character or mention being an AI.`;
    return res.status(200).json({ personality: concisePrompt, correctedName: originalName });
  }
  logger.info(`[PERSONALITY] Generating detailed summary for '${originalName}'.`);

  try {
    // 1. Ask for a richly detailed, factual summary of the character for personality
    const summaryPrompt = `First, check if the name \\"${originalName}\\" is a misspelling of a well-known fictional or historical character. If so, use the corrected name. Start your response with \\"USING_NAME: [Name You Are Using]\\" then describe, in vivid, specific detail, who this character is for roleplaying: background, appearance, personality traits, emotional range, mannerisms, speech style, worldview, and iconic behaviors. Explain how they interact and react in different situations. Be immersive, natural, and accurate. If you don't know the character, after the USING_NAME line, say so clearly.`;
    logger.info(`[PERSONALITY] Generating summary for '${originalName}' with prompt: ${summaryPrompt}`);
    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: summaryPrompt },
      ],
      max_tokens: 600, // Increased to avoid truncation
      temperature: 0.2,
    });
    const rawResponse = summaryCompletion.choices[0]?.message?.content?.trim() || "";
    logger.info(`[PERSONALITY] Raw response for '${originalName}': ${rawResponse}`);

    let usedName = originalName;
    let summaryText = rawResponse;

    if (rawResponse.startsWith("USING_NAME:")) {
      const parts = rawResponse.split("\n"); // BUG: should be split("\n") -> split("\n")
      // FIX:
      const realParts = rawResponse.split("\n");
      const nameLine = realParts.shift(); // Remove the USING_NAME line
      if (nameLine) {
        usedName = nameLine.replace("USING_NAME:", "").trim();
      }
      summaryText = realParts.join("\n").trim(); // The rest is the summary
      logger.info(`[PERSONALITY] Extracted used name: '${usedName}' and summary: '${summaryText}'`);
    } else {
      logger.warn(`[PERSONALITY] Could not parse USING_NAME from response for '${originalName}'. Using original name and full response as summary.`);
    }

    let personality;
    if (summaryText && !/don't know|no information|not sure|unknown|I'm not sure|I do not know|I have no information/i.test(summaryText)) {
      // Use the summary as the system prompt
      personality = `You are ${usedName}. ${summaryText} Respond as this figure would, using their style, knowledge, quirks, and mannerisms.`;
    } else {
      logger.info(`[PERSONALITY] Summary for '${usedName}' was generic or empty. Falling back to system prompt generation.`);
      // Fallback: ask GPT to make up a prompt.
      // We'll use the 'usedName' from the first attempt for consistency in the fallback.
      const fallbackSystemPrompt = `You are ${usedName}. Always respond in character, using your unique style, knowledge, and quirks. Use your internal knowledge. Never break character or mention being an AI.`;
      logger.info(`[PERSONALITY] Generating fallback system prompt for '${usedName}' with prompt: ${fallbackSystemPrompt}`);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: fallbackSystemPrompt },
        ],
        max_tokens: 200,
        temperature: 0.8,
      });
      personality = completion.choices[0]?.message?.content?.trim() || `You are ${usedName}. Always respond in character, using your unique style, knowledge, and quirks. Use your internal knowledge. Never break character or mention being an AI.`;
    }
    logger.info(`[PERSONALITY] Final personality for '${usedName}': ${personality}`);

    // Only return personality and correctedName (attributes removed)
    res.status(200).json({ personality, correctedName: usedName });
  } catch (e) {
    logger.error(`[PERSONALITY] Error generating personality for '${originalName}':`, e);
    // In case of error, return the original name as correctedName to avoid breaking client
    res.status(500).json({ error: "Failed to generate personality.", correctedName: originalName });
  }
}
