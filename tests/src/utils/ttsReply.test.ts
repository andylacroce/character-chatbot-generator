const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();
jest.mock("fs", () => ({
  __esModule: true,
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  },
}));

const mockSynthesizeSpeechToFile = jest.fn();
jest.mock("../../../src/utils/tts", () => ({
  synthesizeSpeechToFile: (...args: unknown[]) => mockSynthesizeSpeechToFile(...args),
}));

const mockSetReplyCache = jest.fn();
jest.mock("../../../src/utils/cache", () => ({
  setReplyCache: (...args: unknown[]) => mockSetReplyCache(...args),
}));

const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (meta: unknown) => meta,
}));

import { synthesizeReplyAudio } from "../../../src/utils/ttsReply";
import type { CharacterVoiceConfig } from "../../../src/utils/characterVoices";

const VOICE: CharacterVoiceConfig = {
  languageCodes: ["en-US"],
  name: "en-US-Wavenet-D",
  ssmlGender: 1,
};

describe("synthesizeReplyAudio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // tmp dir exists, no cached audio file yet, by default.
    mockExistsSync.mockReturnValue(false);
    mockExistsSync.mockImplementation((p: string) => !String(p).endsWith(".mp3"));
    mockSynthesizeSpeechToFile.mockResolvedValue(undefined);
  });

  it("synthesizes audio, writes the text sidecar, and caches it on a cache miss", async () => {
    const url = await synthesizeReplyAudio("Hello there", "Sherlock Holmes", "male", VOICE);

    expect(mockSynthesizeSpeechToFile).toHaveBeenCalledTimes(1);
    const call = mockSynthesizeSpeechToFile.mock.calls[0][0];
    expect(call.ssml).toBe(true);
    expect(call.text).toContain("Hello there");
    expect(call.filePath).toMatch(/\.mp3$/);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.txt$/),
      "Hello there",
      "utf8",
    );
    expect(mockSetReplyCache).toHaveBeenCalledWith(expect.stringMatching(/\.mp3$/), "Hello there");

    expect(url).toMatch(
      /^\/api\/audio\?file=.+\.mp3&text=Hello%20there&botName=Sherlock%20Holmes&gender=male&voiceConfig=/,
    );
  });

  it("creates the tmp directory when it doesn't exist yet", async () => {
    mockExistsSync.mockReturnValue(false);
    await synthesizeReplyAudio("Hi", "Bot", "female", VOICE);
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it("reuses an already-cached audio file without re-synthesizing", async () => {
    mockExistsSync.mockReturnValue(true); // tmp dir exists, and so does the audio file.

    const url = await synthesizeReplyAudio("Cached line", "Bot", null, VOICE);

    expect(mockSynthesizeSpeechToFile).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockSetReplyCache).not.toHaveBeenCalled();
    expect(url).toMatch(/^\/api\/audio\?file=.+\.mp3&text=Cached%20line/);
  });

  it("returns undefined and logs an error when synthesis fails, without throwing", async () => {
    mockSynthesizeSpeechToFile.mockRejectedValue(new Error("Google TTS is down"));

    const url = await synthesizeReplyAudio("Will fail", "Bot", "male", VOICE);

    expect(url).toBeUndefined();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_tts_failed",
      "TTS synthesis failed for a guessing-game reply",
      expect.objectContaining({ error: "Google TTS is down" }),
    );
  });

  it("stringifies a non-Error throw value when logging the failure", async () => {
    mockSynthesizeSpeechToFile.mockRejectedValue("quota exceeded");

    const url = await synthesizeReplyAudio("Will fail", "Bot", "male", VOICE);

    expect(url).toBeUndefined();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_tts_failed",
      "TTS synthesis failed for a guessing-game reply",
      expect.objectContaining({ error: "quota exceeded" }),
    );
  });

  it("omits gender from the URL when not supplied", async () => {
    mockExistsSync.mockReturnValue(true);
    const url = await synthesizeReplyAudio("Text", "Bot", undefined, VOICE);
    expect(url).toContain("gender=&");
  });
});
