/** Periodic cleanup of stale TTS audio files (and their .txt companions) from the OS temp dir. */

import fs from "fs";
import os from "os";
import path from "path";
import { logEvent, sanitizeLogMeta } from "./logger";

const AUDIO_FILE_MAX_AGE = 24 * 60 * 60 * 1000; // Delete audio files older than 24 hours

/** Deletes .mp3/.txt files in the OS temp dir older than AUDIO_FILE_MAX_AGE, to prevent disk bloat. */
export function cleanupOldAudioFiles() {
  try {
    const tmpDir = os.tmpdir();
    if (!fs.existsSync(tmpDir)) return;

    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      if (file.endsWith(".mp3") || file.endsWith(".txt")) {
        const filePath = path.join(tmpDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtime.getTime() > AUDIO_FILE_MAX_AGE) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch {
          // Silently skip individual files that fail to delete (may be in use)
        }
      }
    }

    if (cleanedCount > 0) {
      logEvent(
        "info",
        "chat_audio_cleanup",
        "Cleaned up old audio files",
        sanitizeLogMeta({ cleanedCount }),
      );
    }
  } catch (err) {
    logEvent(
      "error",
      "chat_audio_cleanup_failed",
      "Audio file cleanup failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}
