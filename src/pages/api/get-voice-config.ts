// =============================
// pages/api/get-voice-config.ts
// Next.js API route for retrieving a character's TTS voice configuration.
// Accepts POST requests with a character name and returns a voice config object.
// =============================

import type { NextApiRequest, NextApiResponse } from "next";
import { getVoiceConfigForCharacter } from "../../utils/characterVoices";
import { sanitizeCharacterName, sanitizeVoiceContext } from "../../utils/security";
import { withRequestLog } from "../../utils/withRequestLog";

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
 *               voiceContext:
 *                 type: string
 *                 maxLength: 4000
 *                 description: Generated personality and speaking-style context used for casting.
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
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const { name, gender, voiceContext } = req.body;
  const sanitizedName = typeof name === "string" ? sanitizeCharacterName(name) : "";
  if (!sanitizedName) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  const sanitizedVoiceContext =
    typeof voiceContext === "string" ? sanitizeVoiceContext(voiceContext) : undefined;
  try {
    const config = await getVoiceConfigForCharacter(
      sanitizedName,
      typeof gender === "string" ? gender : null,
      sanitizedVoiceContext,
    );
    res.status(200).json(config);
    return;
  } catch {
    res.status(500).json({ error: "Failed to get voice config" });
    return;
  }
}

export default withRequestLog(handler);
