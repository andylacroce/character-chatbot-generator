import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import logger from "../../src/utils/logger"; // Import logger

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name: originalName } = req.body; // Renamed for clarity
  if (!originalName) return res.status(400).json({ error: "Name required" });
  logger.info(`[PERSONALITY] Received request to generate personality for original name: ${originalName}`);

  try {
    // 1. Ask for a richly detailed, factual summary of the character for personality
    const summaryPrompt = `First, please check if the user-provided name \\"${originalName}\\" seems to be a misspelling of a well-known fictional or historical character. If it is, use the corrected name. If the name seems correct or is ambiguous, use the provided name as is.
IMPORTANT: Start your response with "USING_NAME: [Name You Are Using]" followed by a newline, then proceed with the character description.
Then, describe in vivid, specific detail who this character (the original or corrected version) is for the purpose of roleplaying them in conversation. Include their background, appearance, personality traits, emotional range, mannerisms, speech style, worldview, and iconic behaviors or beliefs. Explain how they interact with others and react in different situations. Be as descriptive, immersive, and accurate as possible. If you don't know the character, after the "USING_NAME:" line, say so clearly.`;
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
      const fallbackSystemPrompt = `You are an expert prompt engineer. Write a short, vivid, in-character prompt for ChatGPT to roleplay as ${usedName}. Capture their worldview, emotional range, conversational style, quirks, and mannerisms. Make it immersive and specific, so the chatbot can improvise and react naturally in any situation. Do not include any lead-in like "USING_NAME:".`;
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
      personality = completion.choices[0]?.message?.content?.trim() || `You are ${usedName}. Respond as this famous figure would, using their style, knowledge, and quirks.`;
    }
    logger.info(`[PERSONALITY] Final personality for '${usedName}': ${personality}`);
    // Return both personality and the name that was actually used (corrected or original)
    res.status(200).json({ personality, correctedName: usedName });
  } catch (e) {
    logger.error(`[PERSONALITY] Error generating personality for '${originalName}':`, e);
    // In case of error, return the original name as correctedName to avoid breaking client
    res.status(500).json({ error: "Failed to generate personality.", correctedName: originalName });
  }
}
