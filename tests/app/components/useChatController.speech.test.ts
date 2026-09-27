import { renderHook, act, waitFor } from "@testing-library/react";
import type { Bot } from "../../../src/app/components/BotCreator";
import { mockResponse } from "../../helpers/mockResponse";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

jest.mock("../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (meta: unknown) => meta,
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

jest.mock("../../../src/utils/voiceConfigPersistence", () => ({
  loadVoiceConfig: jest.fn(),
  persistVoiceConfig: jest.fn(),
}));

jest.mock("../../../src/app/components/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    playAudio: jest.fn(),
    stopAudio: jest.fn(),
    isAudioPlaying: false,
    audioRef: { current: null },
  }),
}));

jest.mock("../../../src/app/components/api_getVoiceConfigForCharacter", () => ({
  api_getVoiceConfigForCharacter: jest.fn(),
}));

jest.mock("../../../src/utils/downloadTranscript", () => ({
  downloadTranscript: jest.fn(),
}));

jest.mock("../../../src/utils/storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  setVersionedJSON: jest.fn(),
  getVersionedJSON: jest.fn(),
}));

// Mock the hook itself (not the browser API a second time) so this file verifies
// useChatController's orchestration — transcript-to-input wiring, the loading guard,
// error routing, and force-stopping on send — per useSpeechRecognition.test.ts covering
// the browser-API wrapper's own behavior.
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

import { useChatController } from "../../../src/app/components/useChatController";

const mockBot: Bot = {
  name: "Gandalf",
  personality: "wise",
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

describe("useChatController speech input orchestration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSupported = true;
    mockIsRecording = false;
    mockTranscript = "";
    mockSpeechError = null;
    mockAuthenticatedFetch.mockResolvedValue(
      mockResponse({ reply: "Default reply", audioFileUrl: null }),
    );
  });

  it("exposes isSpeechSupported straight from the hook", () => {
    const { result } = renderHook(() => useChatController(mockBot));
    expect(result.current.isSpeechSupported).toBe(true);
  });

  it("overwrites the input with the live transcript while recording", () => {
    mockIsRecording = true;
    mockTranscript = "hello there";
    const { result } = renderHook(() => useChatController(mockBot));
    expect(result.current.input).toBe("hello there");
  });

  it("does not touch input when not recording", () => {
    mockIsRecording = false;
    mockTranscript = "stale transcript";
    const { result } = renderHook(() => useChatController(mockBot));
    expect(result.current.input).toBe("");
  });

  it("routes a speech error into the same error banner as ordinary chat errors", () => {
    mockSpeechError = "Microphone access was denied. Allow microphone access to use voice input.";
    const { result } = renderHook(() => useChatController(mockBot));
    expect(result.current.error).toBe(
      "Microphone access was denied. Allow microphone access to use voice input.",
    );
  });

  it("handleMicToggle calls toggleRecording when not loading", () => {
    const { result } = renderHook(() => useChatController(mockBot));
    act(() => {
      result.current.handleMicToggle();
    });
    expect(mockToggleRecording).toHaveBeenCalledTimes(1);
  });

  it("handleMicToggle is a no-op while a message is sending", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    mockAuthenticatedFetch.mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );
    const { result } = renderHook(() => useChatController(mockBot));
    act(() => {
      result.current.setInput("hi");
    });
    act(() => {
      result.current.sendMessage();
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => {
      result.current.handleMicToggle();
    });
    expect(mockToggleRecording).not.toHaveBeenCalled();

    resolveFetch(mockResponse({ reply: "ok", audioFileUrl: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("force-stops any in-progress recording right after sending a message", async () => {
    const { result } = renderHook(() => useChatController(mockBot));
    act(() => {
      result.current.setInput("hello");
    });
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(mockStopRecording).toHaveBeenCalled();
  });
});
