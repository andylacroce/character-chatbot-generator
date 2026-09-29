import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  parseGuessWhoRoundResult,
  getReplayAudioUrl,
  findSpeakerVoiceConfig,
  useGuessWhoSession,
  type GuessWhoLogger,
  type GuessWhoRoundResult,
  type GuessWhoStorage,
  type GuessWhoTransport,
  type PersistedGuessWhoState,
  STORAGE_KEYS,
} from "character-chatbot-shared";
import { authenticatedFetch } from "../../utils/api";
import storage from "../../utils/storage";
import type { Message } from "../../types/message";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { useAudioPlayer } from "./useAudioPlayer";
import { useAudioEnabled } from "./useAudioEnabled";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import type { LoadingStage } from "./CharacterLoadingOverlay";
import {
  fetchRoundWithProgress as sharedFetchRoundWithProgress,
  initialRoundStages,
} from "./useGameRoundProgress";

export type { GuessWhoEvent } from "character-chatbot-shared";

/** Reads a persisted "Guess Who" round back from localStorage, or null if none is stored. */
function loadPersistedState(): PersistedGuessWhoState | null {
  const guessWhoToken = storage.getItem(STORAGE_KEYS.guessWhoToken);
  if (!guessWhoToken) return null;
  const rest = storage.getJSON<Omit<PersistedGuessWhoState, "guessWhoToken">>(
    STORAGE_KEYS.guessWhoTranscript,
  );
  if (!rest) return null;
  return { guessWhoToken, ...rest };
}

/** Persists (or clears, when `state` is null) the current round to localStorage. */
function persistState(state: PersistedGuessWhoState | null) {
  if (!state) {
    storage.removeItem(STORAGE_KEYS.guessWhoToken);
    storage.removeItem(STORAGE_KEYS.guessWhoTranscript);
    return;
  }
  const { guessWhoToken, ...rest } = state;
  storage.setItem(STORAGE_KEYS.guessWhoToken, guessWhoToken);
  storage.setJSON(STORAGE_KEYS.guessWhoTranscript, rest);
}

const guessWhoStorage: GuessWhoStorage = { load: loadPersistedState, save: persistState };

/** Logs a "Guess Who" failure through the structured logger (browser only). */
const logGuessWhoEvent: GuessWhoLogger = (level, event, message, error) => {
  if (typeof window === "undefined") return;
  logEvent(
    level,
    event,
    message,
    sanitizeLogMeta({ error: error instanceof Error ? error.message : String(error) }),
  );
};

/** POSTs JSON to a Guess Who endpoint and returns the parsed body, throwing on a non-2xx status. */
async function postGuessWho<T>(url: string, body: unknown): Promise<T> {
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Calls a Guess Who round-generation endpoint with real staged SSE progress — see useGameRoundProgress.ts. */
function fetchRoundWithProgress(
  url: string,
  body: Record<string, unknown>,
  onProgress: (label: string, stages: LoadingStage[]) => void,
): Promise<GuessWhoRoundResult> {
  return sharedFetchRoundWithProgress(url, body, onProgress, parseGuessWhoRoundResult);
}

/**
 * The web app's "Guess Who" hook: the shared useGuessWhoSession state machine (see
 * packages/shared/src/useGuessWhoSession.ts, also used by the mobile app) plus what's
 * specific to the browser — SSE-streamed round progress, localStorage persistence, the
 * shared audio player with its `audioEnabled` preference, and chat scroll/focus. Audio
 * playback mirrors useChatController.ts/useGuessWhoNextController.ts, so this game has
 * full audio parity with ordinary chat, see CLAUDE.md's "Guess Who" section.
 */
export function useGuessWhoController() {
  const { status: sessionStatus } = useSession();
  const [continueProgressMessage, setContinueProgressMessage] = useState("Starting…");
  const [continueProgressStages, setContinueProgressStages] =
    useState<LoadingStage[]>(initialRoundStages());
  const [startProgressMessage, setStartProgressMessage] = useState("Starting…");
  const [startProgressStages, setStartProgressStages] =
    useState<LoadingStage[]>(initialRoundStages());
  const chatBoxRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { audioEnabled, audioEnabledRef, toggleAudio: handleAudioToggle } = useAudioEnabled();
  const { playAudio, stopAudio, isAudioPlaying, audioRef } = useAudioPlayer(audioEnabledRef);

  const transport: GuessWhoTransport = {
    start: () =>
      fetchRoundWithProgress("/api/guess-who/start", {}, (label, stages) => {
        setStartProgressMessage(label);
        setStartProgressStages(stages);
      }),
    continueRound: (guessWhoToken) =>
      fetchRoundWithProgress("/api/guess-who/continue", { guessWhoToken }, (label, stages) => {
        setContinueProgressMessage(label);
        setContinueProgressStages(stages);
      }),
    sendMessage: (request) => postGuessWho("/api/guess-who/message", request),
    giveUp: (guessWhoToken) => postGuessWho("/api/guess-who/give-up", { guessWhoToken }),
    getHighScore: () => authenticatedFetch("/api/guess-who/high-score").then((res) => res.json()),
  };

  const session = useGuessWhoSession({
    transport,
    storage: guessWhoStorage,
    log: logGuessWhoEvent,
    identityKey: sessionStatus === "loading" ? null : sessionStatus,
    onQuit: stopAudio,
  });
  const {
    messages,
    loading,
    input,
    setInput,
    sendMessage: sendSessionMessage,
    startGame: startSession,
    continueRound: continueSession,
  } = session;

  useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading });

  const {
    isSupported: isSpeechSupported,
    isRecording,
    transcript,
    error: speechError,
    stopRecording,
    toggleRecording,
  } = useSpeechRecognition();

  // Same overwrite-while-dictating behavior as useChatController.ts's chat input.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isRecording) setInput(transcript);
  }, [isRecording, transcript, setInput]);

  // useGuessWhoSession's own `error` state isn't settable from here, so a
  // speech-recognition error is tracked separately and cleared the moment a message
  // actually sends — mirrors useGuessWhoNextController.ts's identical pattern.
  const [speechErrorDisplay, setSpeechErrorDisplay] = useState<string | null>(null);
  useEffect(() => {
    if (speechError) setSpeechErrorDisplay(speechError);
  }, [speechError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleMicToggle = useCallback(() => {
    if (loading) return;
    toggleRecording();
  }, [loading, toggleRecording]);

  // Force-stops any in-progress recording right after sending, same as ordinary chat.
  const sendMessage = useCallback(() => {
    setSpeechErrorDisplay(null);
    stopRecording();
    return sendSessionMessage();
  }, [sendSessionMessage, stopRecording]);

  const replayMessageAudio = useCallback(
    async (message: Message) => {
      if (message.sender === "User") return;
      try {
        await playAudio(
          getReplayAudioUrl({
            audioFileUrl: message.audioFileUrl,
            text: message.text,
            botName: message.sender,
            // The mystery character keeps one voice for the whole round. This only
            // matters as a fallback when TTS failed for this specific turn — without
            // it, the on-demand /api/audio URL built below would carry no voiceConfig
            // at all, forcing the server into a fresh, context-free re-cast.
            gender: null,
            voiceConfig: findSpeakerVoiceConfig(messages, message.sender),
          }),
        );
      } catch (err) {
        logGuessWhoEvent(
          "error",
          "guess_who_audio_replay_error",
          "Failed to replay message audio",
          err,
        );
      }
    },
    [messages, playAudio],
  );

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !audioEnabled;
  }, [audioEnabled, audioRef]);

  // Autoplay the latest bot message's audio, same dedupe-by-content-hash approach
  // useChatController.ts/useGuessWhoNextController.ts use.
  const lastPlayedHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender === "User" || typeof lastMsg.audioFileUrl !== "string") return;
    const hash = `${lastMsg.sender}__${lastMsg.text}__${lastMsg.audioFileUrl}`;
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (hash === lastPlayedHashRef.current) return;
    lastPlayedHashRef.current = hash;
    const abortController = new AbortController();
    playAudio(lastMsg.audioFileUrl, abortController.signal).catch((err: unknown) => {
      if (typeof window === "undefined") return;
      const errName =
        err && typeof err === "object" && "name" in err
          ? ((err as Record<string, unknown>)["name"] as string | undefined)
          : undefined;
      if (errName === "AbortError") {
        logEvent("info", "guess_who_audio_playback_aborted", "Audio playback aborted");
      } else {
        logGuessWhoEvent("error", "guess_who_audio_playback_error", "Audio playback failed", err);
      }
    });
    return () => {
      abortController.abort();
    };
  }, [messages, playAudio]);

  useEffect(() => stopAudio, [stopAudio]);

  /** Starts a new run, then resets the progress checklist for next time. */
  const startGame = useCallback(async () => {
    await startSession();
    setStartProgressMessage("Starting…");
    setStartProgressStages(initialRoundStages());
  }, [startSession]);

  /** Continues past a correct guess, then resets the progress checklist for next time. */
  const continueRound = useCallback(async () => {
    await continueSession();
    setContinueProgressMessage("Starting…");
    setContinueProgressStages(initialRoundStages());
  }, [continueSession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !loading && input.trim()) {
        sendMessage();
      }
    },
    [loading, input, sendMessage],
  );

  return {
    ...session,
    error: speechErrorDisplay || session.error,
    sendMessage,
    continueRound,
    continueProgressMessage,
    continueProgressStages,
    chatBoxRef,
    inputRef,
    audioEnabled,
    handleAudioToggle,
    replayMessageAudio,
    stopAudio,
    isAudioPlaying,
    startGame,
    startProgressMessage,
    startProgressStages,
    handleKeyDown,
    isSpeechSupported,
    isRecording,
    handleMicToggle,
  };
}
