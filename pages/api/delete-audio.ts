// =============================
// pages/api/delete-audio.ts
// Next.js API route for deleting temporary audio files from the server.
// Used for cleanup after TTS playback.
// =============================

import fs from "fs/promises";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";

/**
 * Next.js API route handler for deleting temporary audio files from the server.
 * Used for cleanup after TTS playback.
 *
 * @param {NextApiRequest} req - The API request object.
 * @param {NextApiResponse} res - The API response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { file } = req.query;
  // Only allow simple filenames, not paths
  if (
    !file ||
    typeof file !== "string" ||
    file.includes("..") ||
    path.isAbsolute(file)
  ) {
    logEvent("info", "delete_audio_bad_request", "Delete-Audio API bad request", sanitizeLogMeta({
      file
    }));
    return res.status(400).json({ error: "Invalid file specified" });
  }
  const filePath = path.join("/tmp", file);
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    logEvent("info", "delete_audio_file_deleted", "Delete-Audio API file deleted", sanitizeLogMeta({
      file
    }));
    return res.status(200).json({ message: "File deleted" });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      logEvent("info", "delete_audio_file_not_found", "Delete-Audio API file not found", sanitizeLogMeta({
        file
      }));
      return res.status(404).json({ error: "File not found" });
    }
    logEvent("error", "delete_audio_internal_error", "Delete-Audio API internal error", sanitizeLogMeta({
      file,
      error: error instanceof Error ? error.message : String(error)
    }));
    return res.status(500).json({ error: "Error deleting file" });
  }
}
