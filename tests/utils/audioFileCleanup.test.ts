jest.mock("fs", () => ({
  __esModule: true,
  default: {
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    unlinkSync: jest.fn(),
  },
}));

const mockLogEvent = jest.fn();
jest.mock("../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

import fs from "fs";
import os from "os";
import path from "path";
import { cleanupOldAudioFiles } from "../../src/utils/audioFileCleanup";

const mockFs = fs as unknown as Record<string, jest.Mock>;
const HASH = "a".repeat(64);
const DAY = 24 * 60 * 60 * 1000;

describe("cleanupOldAudioFiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
  });

  it("deletes only this app's stale audio files, never unrelated temp files", () => {
    const appFiles = [`${HASH}.mp3`, `${HASH}.txt`, "replay-0123abcd.mp3", "Ada_1700000000000.mp3"];
    const foreign = ["notes.txt", "song.mp3", "report.txt", "bot-reply-cache.json", `${HASH}.log`];
    mockFs.readdirSync.mockReturnValue([...appFiles, ...foreign]);
    mockFs.statSync.mockReturnValue({ mtime: new Date(Date.now() - 2 * DAY) });

    cleanupOldAudioFiles();

    expect(mockFs.unlinkSync.mock.calls.map((c) => c[0]).sort()).toEqual(
      appFiles.map((f) => path.join(os.tmpdir(), f)).sort(),
    );
    expect(mockLogEvent).toHaveBeenCalledWith("info", "chat_audio_cleanup", expect.any(String), {
      cleanedCount: 4,
    });
  });

  it("keeps files younger than 24 hours", () => {
    mockFs.readdirSync.mockReturnValue([`${HASH}.mp3`]);
    mockFs.statSync.mockReturnValue({ mtime: new Date(Date.now() - DAY / 2) });
    cleanupOldAudioFiles();
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it("skips a file that can't be stat'd or deleted and keeps going", () => {
    mockFs.readdirSync.mockReturnValue([`${HASH}.mp3`, "Ada_1700000000000.mp3"]);
    mockFs.statSync
      .mockImplementationOnce(() => {
        throw new Error("busy");
      })
      .mockReturnValueOnce({ mtime: new Date(0) });
    cleanupOldAudioFiles();
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the temp dir is missing, and logs a listing failure", () => {
    mockFs.existsSync.mockReturnValue(false);
    cleanupOldAudioFiles();
    expect(mockFs.readdirSync).not.toHaveBeenCalled();

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockImplementation(() => {
      throw new Error("EACCES");
    });
    cleanupOldAudioFiles();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "chat_audio_cleanup_failed",
      expect.any(String),
      expect.anything(),
    );
  });
});
