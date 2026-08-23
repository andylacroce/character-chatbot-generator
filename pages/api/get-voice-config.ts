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
 *
 * @swagger
 * /get-voice-config:
 *   post:
 *     summary: Get a character's TTS voice configuration
 *     tags: [Voice]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sherlock Holmes
 *               gender:
 *                 type: string
 *                 nullable: true
 *                 example: male
 *     responses:
 *       200:
 *         description: Voice configuration for the character
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Name required
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Failed to get voice config
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const { name, gender } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  try {
    const config = await getVoiceConfigForCharacter(name, gender);
    res.status(200).json(config);
    return;
  } catch {
    res.status(500).json({ error: "Failed to get voice config" });
    return;
  }
}
