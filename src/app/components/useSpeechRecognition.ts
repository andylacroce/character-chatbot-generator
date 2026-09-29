/**
 * Browser-native speech-to-text hook for the chat input.
 * Wraps the Web Speech API (SpeechRecognition / webkitSpeechRecognition) behind a
 * ref, mirroring useAudioPlayer.ts's imperative-ref-over-browser-API pattern. Exposes
 * the transcript rather than writing into an input directly, so the merge decision
 * (overwrite vs. append) lives at the integration point (useChatController.ts /
 * useGuessWhoNextController.ts), not inside this browser-API wrapper. The transcript itself is
 * run through normalizeDictatedText (capitalization/punctuation spacing only, no
 * spelling/grammar correction) before being returned, so it already reads cleanly while
 * still being dictated.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal shape of the SpeechRecognition API this hook actually uses. */
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/**
 * Lightweight, local cleanup applied to the live transcript as it lands in the input —
 * capitalization and punctuation spacing only, never a real spelling/grammar fix (that
 * would need a Claude call, breaking voice input's zero-cost design). Runs on every
 * `onresult` update, not just once at the end, so the input already reads cleanly while
 * still dictating.
 */
export function normalizeDictatedText(text: string): string {
  let result = text.trim().replace(/\s+/g, " ");
  // Remove space before punctuation ("hello , there" -> "hello, there"). A single literal
  // space (not \s+) is enough here since the previous line already collapsed all runs of
  // whitespace to one space.
  result = result.replace(/ ([,.!?;:])/g, "$1");
  // Capitalize the first letter of the string and after any sentence-ending punctuation.
  result = result.replace(
    /(^\s*|[.!?]\s+)([a-z])/g,
    (_m, prefix, letter) => prefix + letter.toUpperCase(),
  );
  // The standalone pronoun "I" often comes back lowercase from recognition.
  result = result.replace(/\bi\b/g, "I");
  return result;
}

/** Normalizes a SpeechRecognition error code into a user-facing message. `aborted` is expected (user-initiated stop) and never surfaced. */
function describeSpeechError(code: string): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow microphone access to use voice input.";
    case "no-speech":
      return "No speech was detected. Please try again.";
    case "audio-capture":
      return "No microphone was found. Please check your device.";
    case "network":
      return "A network error interrupted voice input. Please try again.";
    case "aborted":
      return null;
    default:
      return "Voice input failed. Please try again.";
  }
}

/**
 * Wraps the browser's SpeechRecognition API for dictating chat messages.
 * Returns isSupported, isRecording, transcript, error, and start/stop/toggle helpers.
 */
export function useSpeechRecognition() {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Detecting a browser API on `window` can only happen post-mount (this component is
  // SSR'd), not derived during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor =
      (
        window as unknown as {
          SpeechRecognition?: SpeechRecognitionConstructor;
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
        .webkitSpeechRecognition;
    setIsSupported(typeof Ctor === "function");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stopRecording = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  const startRecording = useCallback(() => {
    if (typeof window === "undefined" || isRecording) return;
    const Ctor =
      (
        window as unknown as {
          SpeechRecognition?: SpeechRecognitionConstructor;
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
        .webkitSpeechRecognition;
    if (!Ctor) {
      setIsSupported(false);
      return;
    }
    setError(null);
    setTranscript("");
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";

    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0]?.transcript ?? "";
      }
      setTranscript(normalizeDictatedText(combined));
    };
    recognition.onerror = (event) => {
      const message = describeSpeechError(event.error);
      if (message) setError(message);
    };
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    try {
      recognition.start();
    } catch {
      setIsRecording(false);
      recognitionRef.current = null;
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
    };
  }, []);

  return {
    isSupported,
    isRecording,
    transcript,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
