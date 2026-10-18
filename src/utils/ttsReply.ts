/**
 * The one TTS pipeline for ordinary chat and the guessing games: synthesizes (or reuses) a
 * content-hash-named mp3 and returns its playable /api/audio URL, same file naming and query
 * contract everywhere so a replay (`/api/audio`) finds what a reply produced.
 *
 * TTS is an enhancement, never a requirement: any failure here returns undefined rather
 * than throwing, so a synthesis hiccup degrades to a text-only reply.
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import sanitizeFilename from "sanitize-filename";
import { synthesizeSpeechToFile } from "./tts";
import { buildSsml } from "./voiceHelpers";
import { setReplyCache } from "./cache";
import { logEvent, sanitizeLogMeta } from "./logger";
import type { CharacterVoiceConfig } from "./characterVoices";

/** Deterministic JSON (sorted object keys) so equal voice configs hash equally. */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const record = obj as Record<string, unknown>;
  return (
    "{" +
    Object.keys(record)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableStringify(record[k]))
      .join(",") +
    "}"
  );
}

/**
 * Synthesizes (or reuses a cached) TTS file for `text` and returns its /api/audio URL, or undefined on failure.
 * `hideIdentity` keeps the speaker's name and gender out of the URL (a mystery speaker's answer);
 * the URL still carries the full voice config, which is all /api/audio needs to replay it.
 * `logPrefix` namespaces the failure events by caller (`chat_tts_failed`, `game_tts_failed`).
 */
export async function synthesizeReplyAudio(
  text: string,
  botName: string,
  gender: string | null | undefined,
  voiceConfig: CharacterVoiceConfig,
  hideIdentity = false,
  logPrefix: "chat" | "game" = "game",
): Promise<string | undefined> {
  try {
    const tmpDir = os.tmpdir();
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const cacheKey = crypto
      .createHash("sha256")
      .update(text)
      .update(stableStringify(voiceConfig))
      .digest("hex");
    const audioFileName = sanitizeFilename(`${cacheKey}.mp3`);
    const audioFilePath = path.join(tmpDir, audioFileName);
    const txtFilePath = audioFilePath.replace(/\.mp3$/, ".txt");
    if (!fs.existsSync(audioFilePath)) {
      await synthesizeSpeechToFile({
        text: buildSsml(text, voiceConfig),
        filePath: audioFilePath,
        ssml: true,
        voice: voiceConfig,
      });
      fs.writeFileSync(txtFilePath, text, "utf8");
      setReplyCache(audioFileName, text);
    } else {
      // /api/audio checks this sidecar against the requested text; heal a missing or stale one.
      try {
        if (
          !fs.existsSync(txtFilePath) ||
          fs.readFileSync(txtFilePath, "utf8").trim() !== text.trim()
        ) {
          fs.writeFileSync(txtFilePath, text, "utf8");
        }
      } catch (err) {
        logEvent(
          "warn",
          `${logPrefix}_txt_write_failed`,
          "Failed to write .txt companion file for audio reply",
          sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
        );
      }
    }
    const urlName = hideIdentity ? "Character" : botName;
    const urlGender = hideIdentity ? "" : gender || "";
    return `/api/audio?file=${audioFileName}&text=${encodeURIComponent(text)}&botName=${encodeURIComponent(urlName)}&gender=${encodeURIComponent(urlGender)}&voiceConfig=${encodeURIComponent(JSON.stringify(voiceConfig))}`;
  } catch (err) {
    logEvent(
      "error",
      `${logPrefix}_tts_failed`,
      "TTS synthesis failed for a reply",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return undefined;
  }
}
