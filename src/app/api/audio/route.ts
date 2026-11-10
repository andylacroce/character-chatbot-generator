/**
 * API endpoint for generating audio responses for chat messages.
 * Uses Google TTS with character persona settings and cached text for regeneration.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";
import { synthesizeSpeechToFile } from "../../../utils/chat/tts";
import { getReplyCache } from "../../../utils/cache";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import type { CharacterVoiceConfig } from "../../../utils/chat/characterVoices";
import { getVoiceConfigForCharacter } from "../../../utils/chat/characterVoices";
import { buildSsml } from "../../../utils/chat/voiceHelpers";
import { sanitizeCharacterName } from "../../../utils/server/security";
import { withRoute } from "../../../utils/server/withRoute";
import { escapesRoot, getOriginalTextForAudio } from "../../../utils/chat/audioFiles";

// Note: deterministic serialization is implemented in app/api/chat/route.ts where it's used for audio URL encoding.

const LIMIT = {
  name: "audio",
  max: 30,
  message: "Too many audio requests from this IP, please try again later.",
};

/**
 * GET /api/audio handler — see the @swagger block below for the documented contract.
 *
 * @swagger
 * /audio:
 *   get:
 *     summary: Fetch (and, if necessary, regenerate) a synthesized audio reply
 *     description: >
 *       Serves an MP3 from the system temp directory or /public. If the file is
 *       missing, or the `text` param doesn't match the cached `.txt` sidecar, the
 *       audio is resynthesized on demand — from the provided text, the `.txt` sidecar,
 *       or the reply cache. A file that can be neither served nor rebuilt is a 404.
 *       Only files resolving inside the temp dir or /public are ever served. Rate
 *       limited to 30 requests/minute/IP.
 *     tags: [Audio]
 *     parameters:
 *       - in: query
 *         name: file
 *         required: true
 *         schema:
 *           type: string
 *         example: a1b2c3.mp3
 *       - in: query
 *         name: text
 *         schema:
 *           type: string
 *           maxLength: 2000
 *         description: Expected reply text; triggers regeneration on mismatch.
 *       - in: query
 *         name: botName
 *         schema:
 *           type: string
 *           default: Character
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *       - in: query
 *         name: voiceConfig
 *         schema:
 *           type: string
 *         description: URL-encoded JSON CharacterVoiceConfig.
 *     responses:
 *       200:
 *         description: MP3 audio content
 *         content:
 *           audio/mpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: File parameter is required, or text parameter exceeds 2000 characters
 *       403:
 *         description: Resolved path escapes the allowed temp/public roots
 *       404:
 *         description: File not found after all regeneration attempts
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Error reading file
 */
export const GET = withRoute(LIMIT, async (req: NextRequest) => {
  const query = Object.fromEntries(req.nextUrl.searchParams);
  const { file, text: expectedText, voiceConfig: voiceConfigParam } = query;
  if (!file || typeof file !== "string") {
    logEvent(
      "info",
      "audio_bad_request",
      "Audio API bad request: file parameter is required",
      sanitizeLogMeta({
        file,
        query: query,
      }),
    );
    return Response.json({ error: "File parameter is required" }, { status: 400 });
  }
  // Only names this app generates: a bare `.mp3` file name. Anything else (no extension,
  // dotfiles) would make the `.txt` sidecar collide with the audio file itself, letting a
  // caller overwrite arbitrary temp files with text.
  if (!/^[^/\\]{1,200}\.mp3$/.test(file) || file.startsWith(".")) {
    logEvent("info", "audio_bad_request", "Audio API bad request: invalid file name");
    return Response.json({ error: "Invalid file name" }, { status: 400 });
  }
  const botName =
    sanitizeCharacterName(typeof query.botName === "string" ? query.botName : "") || "Character";
  const gender = typeof query.gender === "string" ? query.gender : null;
  // Resolved only when audio actually has to be synthesized: without a usable voiceConfig
  // param this is a Claude call, which a request for a file that already exists never needs.
  let voiceConfig: CharacterVoiceConfig | undefined;
  if (typeof voiceConfigParam === "string") {
    try {
      const parsed = JSON.parse(decodeURIComponent(voiceConfigParam));
      if (parsed && typeof parsed === "object") voiceConfig = parsed;
    } catch {
      // Falls through to a looked-up voice below.
    }
  }
  const getVoice = async (): Promise<CharacterVoiceConfig> =>
    (voiceConfig ??= await getVoiceConfigForCharacter(botName, gender));
  // Caps how much text a single request can demand fresh TTS synthesis for — mirrors
  // log-message.ts's existing 2000-char cap on chat message text.
  const MAX_TEXT_LENGTH = 2000;
  if (typeof expectedText === "string" && expectedText.length > MAX_TEXT_LENGTH) {
    logEvent(
      "info",
      "audio_text_too_long",
      "Audio API bad request: text parameter exceeds max length",
      sanitizeLogMeta({ length: expectedText.length }),
    );
    return Response.json({ error: "Text parameter too long" }, { status: 400 });
  }
  // Only allow filename, not path
  const sanitizedFile = path.basename(file);
  // path.basename() removes native path components before joining to the fixed temp root.
  const audioFilePath = path.join(os.tmpdir(), sanitizedFile); // nosemgrep: javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal
  // The basename is joined to a fixed public root and later checked with realpath().
  const localFilePath = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", sanitizedFile); // nosemgrep: javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal
  const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
  const checkFileExists = (filePath: string) =>
    fs.existsSync(filePath) ? fs.realpathSync(filePath) : "";
  let normalizedAudioFilePath = checkFileExists(audioFilePath);
  let normalizedLocalFilePath = checkFileExists(localFilePath);
  let found = false;
  let triedRegenerate = false;
  let regenError: unknown = null;

  // --- ALWAYS use the text param if present ---
  if (typeof expectedText === "string") {
    // Check if .txt file exists and matches expectedText
    let txtContent: string | null = null;
    if (fs.existsSync(txtFilePath)) {
      txtContent = fs.readFileSync(txtFilePath, "utf8");
    }
    if (typeof txtContent === "string" && txtContent.trim() === expectedText.trim()) {
      // .txt matches, serve existing audio if present
      normalizedAudioFilePath = checkFileExists(audioFilePath);
      normalizedLocalFilePath = checkFileExists(localFilePath);
      found = !!normalizedAudioFilePath || !!normalizedLocalFilePath;
      // No need to regenerate audio
    } else {
      // .txt missing or does not match, regenerate audio and update .txt
      try {
        logEvent(
          "info",
          "audio_voice_selected",
          "TTS voice config selected",
          sanitizeLogMeta({
            botName,
            voiceConfig,
          }),
        );
        const selectedVoice = await getVoice();
        const ssmlText = buildSsml(expectedText, selectedVoice);
        await synthesizeSpeechToFile({
          text: ssmlText,
          filePath: audioFilePath,
          ssml: true,
          voice: selectedVoice,
        });
        fs.writeFileSync(txtFilePath, expectedText, "utf8");
        normalizedAudioFilePath = checkFileExists(audioFilePath);
        found = !!normalizedAudioFilePath;
        triedRegenerate = true;
      } catch (err) {
        logEvent(
          "error",
          "audio_synthesis_failed",
          "Audio synthesis failed from text param",
          sanitizeLogMeta({
            file: sanitizedFile,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        regenError = err;
      }
    }
  } else {
    // No `text` param: serve what is on disk, else rebuild from the sidecar or reply cache.
    if (!found) {
      // Only wait for file if we just tried to regenerate it
      triedRegenerate = false;
      regenError = null;

      if (!normalizedAudioFilePath && !normalizedLocalFilePath) {
        let originalText = getOriginalTextForAudio(sanitizedFile);
        if (!originalText) {
          originalText = getReplyCache(sanitizedFile);
        }
        if (originalText) {
          try {
            const selectedVoice = await getVoice();
            const ssmlText = buildSsml(originalText, selectedVoice);
            await synthesizeSpeechToFile({
              text: ssmlText,
              filePath: audioFilePath,
              ssml: true,
              voice: selectedVoice,
            });
            triedRegenerate = true;
            normalizedAudioFilePath = checkFileExists(audioFilePath);
            found = !!normalizedAudioFilePath;
          } catch (err) {
            logEvent(
              "error",
              "audio_regen_failed_cached_text",
              "Audio regeneration failed from cached text",
              sanitizeLogMeta({
                file: sanitizedFile,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
            regenError = err;
          }
        }
      }
      // If we just regenerated, wait for file to appear (retry up to 5 times)
      if (triedRegenerate && !normalizedAudioFilePath) {
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          normalizedAudioFilePath = checkFileExists(audioFilePath);
          if (normalizedAudioFilePath) break;
        }
      }
    }
  }

  // Security: only allow files in /tmp or /public.
  // Each resolved path is checked independently: joining them with && meant the
  // guard only fired when BOTH paths were set and BOTH escaped their root, so a
  // symlink inside the temp directory that realpathSync followed elsewhere would
  // have been served (the sibling path is an empty string in that case).
  const allowedTmp = os.tmpdir();
  const allowedPublic = path.join(/*turbopackIgnore: true*/ process.cwd(), "public");
  if (
    escapesRoot(normalizedAudioFilePath, allowedTmp) ||
    escapesRoot(normalizedLocalFilePath, allowedPublic)
  ) {
    logEvent(
      "warn",
      "audio_forbidden",
      "Audio API forbidden: access forbidden for file",
      sanitizeLogMeta({
        file: sanitizedFile,
      }),
    );
    return Response.json({ error: "Access forbidden" }, { status: 403 });
  }
  const filePath = normalizedAudioFilePath || normalizedLocalFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    logEvent(
      "error",
      "audio_not_found",
      "Audio file not found after all regen attempts",
      sanitizeLogMeta({
        file: sanitizedFile,
        error: regenError instanceof Error ? regenError.message : regenError,
      }),
    );
    return Response.json(
      { error: "File not found after all regeneration attempts" },
      { status: 404 },
    );
  }
  let audioContent;
  try {
    audioContent = fs.readFileSync(filePath);
  } catch (err) {
    logEvent(
      "error",
      "audio_read_error",
      "Audio file read error",
      sanitizeLogMeta({
        file: filePath,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return Response.json({ error: "Error reading file" }, { status: 500 });
  }
  logEvent(
    "info",
    "audio_sent",
    "Audio API success: audio file sent",
    sanitizeLogMeta({
      file: sanitizedFile,
    }),
  );
  return new Response(new Uint8Array(audioContent), { headers: { "Content-Type": "audio/mpeg" } });
});
