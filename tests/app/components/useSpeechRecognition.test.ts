import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "@/src/app/components/useSpeechRecognition";

type Handlers = {
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

let lastInstance: FakeSpeechRecognition | null = null;

class FakeSpeechRecognition implements Handlers {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = jest.fn();
  stop = jest.fn(() => {
    this.onend?.();
  });
  abort = jest.fn();
  constructor() {
    // Capturing the instance for test assertions, not a functional alias of `this`.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastInstance = this;
  }
}

function makeResult(transcript: string) {
  return { 0: { transcript } };
}

describe("useSpeechRecognition", () => {
  const original = (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;

  afterEach(() => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = original;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    lastInstance = null;
    jest.clearAllMocks();
  });

  it("reports unsupported when no SpeechRecognition constructor exists", () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(false);
  });

  it("reports supported and accumulates transcript across interim and final results", () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);

    act(() => {
      result.current.startRecording();
    });
    expect(result.current.isRecording).toBe(true);
    expect(lastInstance?.start).toHaveBeenCalled();

    act(() => {
      lastInstance?.onresult?.({ results: [makeResult("hello")] });
    });
    expect(result.current.transcript).toBe("hello");

    act(() => {
      lastInstance?.onresult?.({ results: [makeResult("hello world")] });
    });
    expect(result.current.transcript).toBe("hello world");
  });

  it("falls back to webkitSpeechRecognition when SpeechRecognition is absent", () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      FakeSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  it.each([
    ["not-allowed", "Microphone access was denied. Allow microphone access to use voice input."],
    ["no-speech", "No speech was detected. Please try again."],
    ["audio-capture", "No microphone was found. Please check your device."],
    ["network", "A network error interrupted voice input. Please try again."],
    ["some-unknown-code", "Voice input failed. Please try again."],
  ])("normalizes error code %s", (code, expected) => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => {
      result.current.startRecording();
    });
    act(() => {
      lastInstance?.onerror?.({ error: code });
    });
    expect(result.current.error).toBe(expected);
  });

  it("treats aborted as expected and never surfaces an error", () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => {
      result.current.startRecording();
    });
    act(() => {
      lastInstance?.onerror?.({ error: "aborted" });
    });
    expect(result.current.error).toBeNull();
  });

  it("stopRecording invokes stop() and clears isRecording via onend", () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => {
      result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });
    expect(lastInstance?.stop).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it("toggleRecording starts when idle and stops when recording", () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => {
      result.current.toggleRecording();
    });
    expect(result.current.isRecording).toBe(true);
    act(() => {
      result.current.toggleRecording();
    });
    expect(result.current.isRecording).toBe(false);
  });

  it("aborts any in-progress recognition on unmount", () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeSpeechRecognition;
    const { result, unmount } = renderHook(() => useSpeechRecognition());
    act(() => {
      result.current.startRecording();
    });
    const instance = lastInstance;
    unmount();
    expect(instance?.abort).toHaveBeenCalled();
  });
});
