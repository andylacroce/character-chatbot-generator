import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    // 1. Ask for a richly detailed, factual summary of the character for personality
    const summaryPrompt = `Describe in vivid, specific detail who ${name} is for the purpose of roleplaying them in conversation. Include their background, appearance, personality traits, emotional range, mannerisms, speech style, worldview, and iconic behaviors or beliefs. Explain how they interact with others and react in different situations. Be as descriptive, immersive, and accurate as possible. If you don't know, say so.`;
    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: summaryPrompt },
      ],
      max_tokens: 600, // Increased to avoid truncation
      temperature: 0.2,
    });
    const summary = summaryCompletion.choices[0]?.message?.content?.trim() || "";
    let personality;
    if (summary && !/don't know|no information|not sure|unknown|I'm not sure|I do not know|I have no information/i.test(summary)) {
      // Use the summary as the system prompt
      personality = `You are ${name}. ${summary} Respond as this figure would, using their style, knowledge, quirks, and mannerisms.`;
    } else {
      // Fallback: ask GPT to make up a prompt as before
      const systemPrompt = `You are an expert prompt engineer. Write a short, vivid, in-character prompt for ChatGPT to roleplay as ${name}. Capture their worldview, emotional range, conversational style, quirks, and mannerisms. Make it immersive and specific, so the chatbot can improvise and react naturally in any situation.`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: systemPrompt },
        ],
        max_tokens: 200,
        temperature: 0.8,
      });
      personality = completion.choices[0]?.message?.content?.trim() || `You are ${name}. Respond as this famous figure would, using their style, knowledge, and quirks.`;
    }
    res.status(200).json({ personality });
  } catch (e) {
    res.status(500).json({ error: "Failed to generate personality." });
  }
}
