// =============================
// app/api/get-voice-config/route.ts
// Next.js API route for retrieving a character's TTS voice configuration.
// Accepts POST requests with a character name and returns a voice config object.
// =============================

import type { NextRequest } from "next/server";
import { getVoiceConfigForCharacter } from "../../../utils/chat/characterVoices";
import { sanitizeCharacterName, sanitizeVoiceContext } from "../../../utils/server/security";
import { withRoute, readJson } from "../../../utils/server/withRoute";

const LIMIT = {
  name: "get-voice-config",
  max: 20,
  message: "Too many voice requests from this IP, please try again later.",
};

/**
 * Next.js API route handler for retrieving a character's TTS voice configuration.
 * Accepts POST requests with a character name and returns a voice config object.
 *
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
 *       500:
 *         description: Failed to get voice config
 */
export const POST = withRoute(LIMIT, async (req: NextRequest) => {
  const body = await readJson(req);
  const { name, gender, voiceContext } = body;
  const sanitizedName = typeof name === "string" ? sanitizeCharacterName(name) : "";
  if (!sanitizedName) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }
  const sanitizedVoiceContext =
    typeof voiceContext === "string" ? sanitizeVoiceContext(voiceContext) : undefined;
  try {
    const config = await getVoiceConfigForCharacter(
      sanitizedName,
      typeof gender === "string" ? gender : null,
      sanitizedVoiceContext,
    );
    return Response.json(config);
  } catch {
    return Response.json({ error: "Failed to get voice config" }, { status: 500 });
  }
});
