import type { NextApiRequest, NextApiResponse } from "next";
import { getVoiceConfigForCharacter } from "../../src/utils/characterVoices";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const config = await getVoiceConfigForCharacter(name);
    res.status(200).json(config);
  } catch {
    res.status(500).json({ error: "Failed to get voice config" });
  }
}
