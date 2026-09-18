/**
 * Synthesizes TTS audio for a reply and returns its playable /api/audio URL, mirroring
 * pages/api/chat.ts's own audio pipeline (same cache-by-content-hash file naming, same
 * /api/audio query contract) so the guessing game gets the same audio experience as
 * ordinary chat, see CLAUDE.md's "Guessing game" section. Kept as its own copy rather
 * than extracted out of chat.ts, since chat.ts's inline version carries its own
 * extensive existing test coverage not worth risking for this reuse.
 *
 * TTS is an enhancement, never a requirement: any failure here returns undefined rather
 * than throwing, so a synthesis hiccup degrades to a text-only reply, same as chat.ts.
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import sanitizeFilename from "sanitize-filename";
import { synthesizeSpeechToFile } from "./tts";
import { normalizeStudioVoice, buildSsml } from "./voiceHelpers";
import { setReplyCache } from "./cache";
import { logEvent, sanitizeLogMeta } from "./logger";
import type { CharacterVoiceConfig } from "./characterVoices";

/** Synthesizes (or reuses a cached) TTS file for `text` and returns its /api/audio URL, or undefined on failure. */
export async function synthesizeReplyAudio(
  text: string,
  botName: string,
  voiceGender: string | null | undefined,
  voiceConfig: CharacterVoiceConfig,
): Promise<string | undefined> {
  try {
    const selectedVoice = normalizeStudioVoice(voiceConfig);
    const ssmlText = buildSsml(text, selectedVoice);
    const tmpDir = os.tmpdir();
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const cacheKey = crypto
      .createHash("sha256")
      .update(text)
      .update(JSON.stringify(selectedVoice))
      .digest("hex");
    const audioFileName = sanitizeFilename(`${cacheKey}.mp3`);
    const audioFilePath = path.join(tmpDir, audioFileName);
    if (!fs.existsSync(audioFilePath)) {
      await synthesizeSpeechToFile({
        text: ssmlText,
        filePath: audioFilePath,
        ssml: true,
        voice: selectedVoice,
      });
      const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
      fs.writeFileSync(txtFilePath, text, "utf8");
      setReplyCache(audioFileName, text);
    }
    return `/api/audio?file=${audioFileName}&text=${encodeURIComponent(text)}&botName=${encodeURIComponent(botName)}&voiceGender=${encodeURIComponent(voiceGender || "")}&voiceConfig=${encodeURIComponent(JSON.stringify(voiceConfig))}`;
  } catch (err) {
    logEvent(
      "error",
      "game_tts_failed",
      "TTS synthesis failed for a guessing-game reply",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return undefined;
  }
}
