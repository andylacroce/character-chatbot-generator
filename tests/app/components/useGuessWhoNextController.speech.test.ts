import { renderHook, act, waitFor } from "@testing-library/react";
import { mockResponse, mockSseResponse } from "../../helpers/mockResponse";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
const mockHighScoreFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) =>
    args[0] === "/api/guess-who-next/high-score"
      ? mockHighScoreFetch(...(args as unknown[]))
      : mockAuthenticatedFetch(...(args as unknown[])),
}));

jest.mock("../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (meta: unknown) => meta,
}));

const mockPlayAudio = jest.fn();
const mockStopAudio = jest.fn();
const mockAudioRef = { current: { muted: false } } as unknown as React.RefObject<HTMLAudioElement>;
jest.mock("../../../src/app/components/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    playAudio: mockPlayAudio,
    stopAudio: mockStopAudio,
    isAudioPlaying: false,
    audioRef: mockAudioRef,
  }),
}));

jest.mock("../../../src/utils/storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getJSON: jest.fn(),
  setJSON: jest.fn(),
}));

// Mock the hook itself (not the browser API a second time) — same rationale as
// useChatController.speech.test.ts.
const mockStartRecording = jest.fn();
const mockStopRecording = jest.fn();
const mockToggleRecording = jest.fn();
let mockIsSupported = true;
let mockIsRecording = false;
let mockTranscript = "";
let mockSpeechError: string | null = null;
jest.mock("../../../src/app/components/useSpeechRecognition", () => ({
  useSpeechRecognition: () => ({
    isSupported: mockIsSupported,
    isRecording: mockIsRecording,
    transcript: mockTranscript,
    error: mockSpeechError,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    toggleRecording: mockToggleRecording,
  }),
}));

import { useGuessWhoNextController } from "../../../src/app/components/useGuessWhoNextController";
import * as storage from "../../../src/utils/storage";

const mockStorage = storage as unknown as jest.Mocked<{
  getItem: jest.Mock;
  getJSON: jest.Mock;
}>;

function roundFrame(overrides: Record<string, unknown> = {}) {
  return {
    gameToken: "token-1",
    currentCharacterName: "Sherlock Holmes",
    avatarUrl: "https://example.com/sherlock.png",
    gender: "male",
    reply: "Greetings, detective.",
    audioFileUrl: "/api/audio?file=intro.mp3",
    streak: 0,
    done: true,
    ...overrides,
  };
}

describe("useGuessWhoNextController speech input orchestration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    mockStorage.getItem.mockReturnValue(null);
    mockStorage.getJSON.mockReturnValue(null);
    mockPlayAudio.mockResolvedValue(undefined);
    mockHighScoreFetch.mockResolvedValue(mockResponse({ highScore: null }));
    mockIsSupported = true;
    mockIsRecording = false;
    mockTranscript = "";
    mockSpeechError = null;
  });

  async function startedHook() {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));
    const rendered = renderHook(() => useGuessWhoNextController());
    await act(async () => {
      await rendered.result.current.startGame();
    });
    return rendered;
  }

  it("exposes isSpeechSupported straight from the hook", () => {
    const { result } = renderHook(() => useGuessWhoNextController());
    expect(result.current.isSpeechSupported).toBe(true);
  });

  it("overwrites the input with the live transcript while recording", () => {
    mockIsRecording = true;
    mockTranscript = "It's Irene Adler";
    const { result } = renderHook(() => useGuessWhoNextController());
    expect(result.current.input).toBe("It's Irene Adler");
  });

  it("routes a speech error into the game's error banner", () => {
    mockSpeechError = "No speech was detected. Please try again.";
    const { result } = renderHook(() => useGuessWhoNextController());
    expect(result.current.error).toBe("No speech was detected. Please try again.");
  });

  it("handleMicToggle calls toggleRecording when not loading", () => {
    const { result } = renderHook(() => useGuessWhoNextController());
    act(() => {
      result.current.handleMicToggle();
    });
    expect(mockToggleRecording).toHaveBeenCalledTimes(1);
  });

  it("force-stops any in-progress recording right after sending a message", async () => {
    const { result } = await startedHook();
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({ reply: "I've solved many cases." }),
    );
    act(() => result.current.setInput("What's your favorite case?"));
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it("clears a lingering speech error display once a message actually sends", async () => {
    mockSpeechError = "No speech was detected. Please try again.";
    const { result } = await startedHook();
    expect(result.current.error).toBe("No speech was detected. Please try again.");

    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Elementary." }));
    act(() => result.current.setInput("What's your favorite case?"));
    await act(async () => {
      await result.current.sendMessage();
    });
    await waitFor(() => expect(result.current.error).toBe(""));
  });
});
