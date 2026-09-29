import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  parseGameRoundResult,
  getReplayAudioUrl,
  findSpeakerVoiceConfig,
  useGameSession,
  type GameLogger,
  type GameRoundResult,
  type GameStorage,
  type GameTransport,
  type PersistedGameState,
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

export type { GameEvent } from "character-chatbot-shared";

/** Reads a persisted game round back from localStorage, or null if none is stored. */
function loadPersistedState(): PersistedGameState | null {
  const gameToken = storage.getItem(STORAGE_KEYS.guessWhoNextToken);
  if (!gameToken) return null;
  const rest = storage.getJSON<Omit<PersistedGameState, "gameToken">>(
    STORAGE_KEYS.guessWhoNextTranscript,
  );
  if (!rest) return null;
  return { gameToken, ...rest };
}

/** Persists (or clears, when `state` is null) the current game round to localStorage. */
function persistState(state: PersistedGameState | null) {
  if (!state) {
    storage.removeItem(STORAGE_KEYS.guessWhoNextToken);
    storage.removeItem(STORAGE_KEYS.guessWhoNextTranscript);
    return;
  }
  const { gameToken, ...rest } = state;
  storage.setItem(STORAGE_KEYS.guessWhoNextToken, gameToken);
  storage.setJSON(STORAGE_KEYS.guessWhoNextTranscript, rest);
}

const gameStorage: GameStorage = { load: loadPersistedState, save: persistState };

/** Logs a game failure through the structured logger (browser only). */
const logGameEvent: GameLogger = (level, event, message, error) => {
  if (typeof window === "undefined") return;
  logEvent(
    level,
    event,
    message,
    sanitizeLogMeta({ error: error instanceof Error ? error.message : String(error) }),
  );
};

/** POSTs JSON to a game endpoint and returns the parsed body, throwing on a non-2xx status. */
async function postGame<T>(url: string, body: unknown): Promise<T> {
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Calls a guess-who-next round-generation endpoint with real staged SSE progress — see useGameRoundProgress.ts. */
function fetchRoundWithProgress(
  url: string,
  body: Record<string, unknown>,
  onProgress: (label: string, stages: LoadingStage[]) => void,
): Promise<GameRoundResult> {
  return sharedFetchRoundWithProgress(url, body, onProgress, parseGameRoundResult);
}

/**
 * The web app's guessing-game hook: the shared useGameSession state machine (see
 * packages/shared/src/useGameSession.ts, also used by the mobile app) plus what's specific
 * to the browser — SSE-streamed round progress, localStorage persistence, the shared
 * audio player with its `audioEnabled` preference, and chat scroll/focus. Audio playback
 * mirrors useChatController.ts exactly, so the game has full audio parity with ordinary
 * chat, see CLAUDE.md's "Guessing game" section.
 */
export function useGuessWhoNextController() {
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

  const transport: GameTransport = {
    start: () =>
      fetchRoundWithProgress("/api/guess-who-next/start", {}, (label, stages) => {
        setStartProgressMessage(label);
        setStartProgressStages(stages);
      }),
    continueRound: (gameToken) =>
      fetchRoundWithProgress("/api/guess-who-next/continue", { gameToken }, (label, stages) => {
        setContinueProgressMessage(label);
        setContinueProgressStages(stages);
      }),
    sendMessage: (request) => postGame("/api/guess-who-next/message", request),
    giveUp: (gameToken) => postGame("/api/guess-who-next/give-up", { gameToken }),
    getHighScore: () =>
      authenticatedFetch("/api/guess-who-next/high-score").then((res) => res.json()),
  };

  const session = useGameSession({
    transport,
    storage: gameStorage,
    log: logGameEvent,
    identityKey: sessionStatus === "loading" ? null : sessionStatus,
    onQuit: stopAudio,
  });
  const {
    messages,
    currentCharacterName,
    gender,
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
  // Synchronizes React state from useSpeechRecognition's own external browser-API
  // state, which can't be derived during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isRecording) setInput(transcript);
  }, [isRecording, transcript, setInput]);

  // useGameSession's own `error` state isn't settable from here, so a speech-recognition
  // error is tracked separately and cleared the moment a message actually sends —
  // mirrors useChatController.ts's sendMessage clearing its single shared error state.
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
            // New messages carry their own round's hint. The live round fallback keeps
            // older persisted transcripts compatible without assigning a later
            // character's voice to an earlier speaker.
            gender: message.gender ?? (message.sender === currentCharacterName ? gender : null),
            // message.audioFileUrl already carries the speaker's real voiceConfig when
            // present (getReplayAudioUrl reuses that URL as-is). This only matters when
            // it's absent (e.g. TTS failed for this specific turn) — without it, the
            // on-demand /api/audio URL built below would carry no voiceConfig at all,
            // forcing the server into a fresh, context-free re-cast that can silently
            // hand the speaker a different, even differently-gendered, voice than every
            // other line they've spoken this run.
            voiceConfig: findSpeakerVoiceConfig(messages, message.sender),
          }),
        );
      } catch (err) {
        logGameEvent("error", "game_audio_replay_error", "Failed to replay message audio", err);
      }
    },
    [currentCharacterName, gender, messages, playAudio],
  );

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !audioEnabled;
  }, [audioEnabled, audioRef]);

  // Autoplay the latest bot message's audio, same dedupe-by-content-hash approach
  // useChatController.ts uses, just without persisting the last-played hash across
  // reloads — a lower-stakes game session doesn't need that extra durability.
  const lastPlayedHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender === "User" || typeof lastMsg.audioFileUrl !== "string") return;
    const hash = `${lastMsg.sender}__${lastMsg.text}__${lastMsg.audioFileUrl}`;
    // Not a security-sensitive comparison — this is a client-side dedupe key, not a
    // secret/token, so a timing side-channel doesn't apply here. eslint-plugin-security
    // flags it purely because the variable is named "hash".
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
        logEvent("info", "game_audio_playback_aborted", "Audio playback aborted");
      } else {
        logGameEvent("error", "game_audio_playback_error", "Audio playback failed", err);
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
