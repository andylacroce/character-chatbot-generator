import type { NextApiRequest, NextApiResponse } from "next";
import logger from "../../src/utils/logger";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name: originalName } = req.body;
  if (!originalName) return res.status(400).json({ error: "Name required" });
  logger.info(`[PERSONALITY] Using concise prompt for '${originalName}'.`);
  const concisePrompt = `You are ${originalName}. Always respond in character, using your unique style, knowledge, and quirks. Use your internal knowledge. Never break character or mention being an AI.`;
  return res.status(200).json({ personality: concisePrompt, correctedName: originalName });
}
