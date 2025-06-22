// =============================
// pages/api/get-voice-config.ts
// Next.js API route for retrieving a character's TTS voice configuration.
// Accepts POST requests with a character name and returns a voice config object.
// =============================

import type { NextApiRequest, NextApiResponse } from "next";
import { getVoiceConfigForCharacter } from "../../src/utils/characterVoices";

/**
 * Next.js API route handler for retrieving a character's TTS voice configuration.
 * Accepts POST requests with a character name and returns a voice config object.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { name, gender } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const config = await getVoiceConfigForCharacter(name, gender);
    res.status(200).json(config);
  } catch {
    res.status(500).json({ error: "Failed to get voice config" });
  }
}
