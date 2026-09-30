import { renderHook, act } from "@testing-library/react";
import type { Bot } from "../../../src/app/components/BotCreator";

// Unauthenticated, so the server-history reconciliation effect is a no-op here.
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

jest.mock("../../../src/utils/storage", () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  clearMemoryFallback: jest.fn(),
  setVersionedJSON: jest.fn(),
}));

// The error each test wants playback to fail with (set before rendering).
let mockPlaybackErrorName = "";
jest.mock("../../../src/app/components/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    playAudio: jest.fn(async () => {
      const err = new Error("playback failed");
      err.name = mockPlaybackErrorName;
      throw err;
    }),
    stopAudio: jest.fn(),
    isAudioPlaying: false,
    audioRef: { current: null },
  }),
}));

import { useChatController } from "../../../src/app/components/useChatController";

const bot: Bot = {
  name: "AudioBot",
  personality: "quiet",
  avatarUrl: "/silhouette.svg",
  voiceConfig: {
    languageCodes: ["en-US"],
    name: "en-US-Wavenet-D",
    ssmlGender: 1,
    pitch: 0,
    rate: 1.0,
    type: "Wavenet",
  },
};

describe("useChatController audio error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not console.error on an AbortError", async () => {
    mockPlaybackErrorName = "AbortError";
    process.env.VERCEL_ENV = "1"; // memory path for the last-played audio hash
    const { result } = renderHook(() => useChatController(bot));
    // Flush the intro-generation effect before spying, so its own unrelated error logging
    // isn't mistaken for output from the abort handling under test.
    await act(async () => {
      await new Promise((res) => setTimeout(res, 10));
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    act(() => {
      result.current.handleBackToCharacterCreation(); // stopAudio path suppresses abort errors
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("console.errors on a non-abort playback error", async () => {
    mockPlaybackErrorName = "PlaybackError";
    delete process.env.VERCEL_ENV; // file path exercises the storage.getItem branch
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    renderHook(() => useChatController(bot));

    await act(async () => {
      await new Promise((res) => setTimeout(res, 50));
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
