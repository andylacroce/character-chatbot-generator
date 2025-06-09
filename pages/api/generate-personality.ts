import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    // 1. Ask for a factual summary of the character for personality
    const summaryPrompt = `Who is ${name}? Give a concise, factual summary suitable for a ChatGPT system prompt. If you don't know, say so.`;
    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: summaryPrompt },
      ],
      max_tokens: 120,
      temperature: 0.2,
    });
    const summary = summaryCompletion.choices[0]?.message?.content?.trim() || "";
    let personality;
    if (summary && !/don't know|no information|not sure|unknown|I'm not sure|I do not know|I have no information/i.test(summary)) {
      // Use the summary as the system prompt
      personality = `You are ${name}. ${summary} Respond as this figure would, using their style, knowledge, and quirks. Avoid modern references.`;
    } else {
      // Fallback: ask GPT to make up a prompt as before
      const systemPrompt = `You are an expert prompt engineer. Write a short, vivid, in-character prompt for ChatGPT to roleplay as ${name}. Capture their style, knowledge, quirks, and avoid modern references.`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write the prompt for ChatGPT to roleplay as ${name}.` },
        ],
        max_tokens: 120,
        temperature: 0.8,
      });
      personality = completion.choices[0]?.message?.content?.trim() || `You are ${name}. Respond as this famous figure would, using their style, knowledge, and quirks.`;
    }
    res.status(200).json({ personality });
  } catch (e) {
    res.status(500).json({ error: "Failed to generate personality." });
  }
}
