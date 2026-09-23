import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  parseGameRoundResult,
  getReplayAudioUrl,
  useGameSession,
  type GameLogger,
  type GameRoundResult,
  type GameStorage,
  type GameTransport,
  type PersistedGameState,
  STORAGE_KEYS,
} from "character-chatbot-shared";
import { authenticatedFetch } from "../../src/utils/api";
import storage from "../../src/utils/storage";
import type { Message } from "../../src/types/message";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { useAudioPlayer } from "./useAudioPlayer";
import { useAudioEnabled } from "./useAudioEnabled";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import type { LoadingStage } from "./CharacterLoadingOverlay";

export type { GameEvent } from "character-chatbot-shared";

/** Reads a persisted game round back from localStorage, or null if none is stored. */
function loadPersistedState(): PersistedGameState | null {
  const gameToken = storage.getItem(STORAGE_KEYS.gameToken);
  if (!gameToken) return null;
  const rest = storage.getJSON<Omit<PersistedGameState, "gameToken">>(STORAGE_KEYS.gameTranscript);
  if (!rest) return null;
  return { gameToken, ...rest };
}

/** Persists (or clears, when `state` is null) the current game round to localStorage. */
function persistState(state: PersistedGameState | null) {
  if (!state) {
    storage.removeItem(STORAGE_KEYS.gameToken);
    storage.removeItem(STORAGE_KEYS.gameTranscript);
    return;
  }
  const { gameToken, ...rest } = state;
  storage.setItem(STORAGE_KEYS.gameToken, gameToken);
  storage.setJSON(STORAGE_KEYS.gameTranscript, rest);
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

/**
 * The real stages src/utils/gameRound.ts's generateGameRound reports as it runs, in
 * display order, plus a trailing synthetic "greeting" entry standing in for the final
 * TTS-synthesis step (the server never reports it by name — it's simply whatever's left
 * once the other four are done, right up until the last frame arrives). Used to compute
 * an honest progress checklist from genuine server-reported "done" events (see
 * fetchRoundWithProgress below) rather than a client-side timer simulating stages that
 * may not match what's actually happening.
 */
const ROUND_STAGE_ORDER: { stage: string; label: string }[] = [
  { stage: "personality", label: "Creating personality…" },
  { stage: "avatar", label: "Generating portrait…" },
  { stage: "reply", label: "Writing opening line…" },
  { stage: "voice", label: "Selecting voice…" },
  { stage: "greeting", label: "Preparing greeting…" },
];

/** The checklist's starting state: nothing done yet, the first stage active. */
function initialRoundStages(): LoadingStage[] {
  return ROUND_STAGE_ORDER.map((entry, index) => ({
    ...entry,
    done: false,
    active: index === 0,
  }));
}

/**
 * Reads a `text/event-stream` response of `data: {...}\n\n` frames, calling `onFrame` for
 * each as it arrives. A malformed frame is skipped rather than aborting the whole stream.
 */
async function readSseFrames(
  response: Response,
  onFrame: (frame: Record<string, unknown>) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onFrame(JSON.parse(line.slice("data:".length).trim()));
      } catch {
        // Skip a malformed frame rather than aborting the whole stream.
      }
    }
  }
}

/**
 * Calls a round-generation endpoint (/api/game/start or /api/game/continue) in streamed
 * mode, reporting REAL progress to `onProgress` as each named step of
 * src/utils/gameRound.ts's generateGameRound genuinely completes — not a client-side
 * timer simulating stages. `completedStages` accumulates as real "done" events arrive;
 * the active stage is always the first one in ROUND_STAGE_ORDER not yet completed, which
 * naturally reflects personality/avatar (and reply/voice, which run concurrently in
 * pairs server-side) resolving in either order — whichever of a pair is still
 * outstanding is what's displayed, never a guess. The synthetic trailing "greeting"
 * stage is never in `completedStages` (the server doesn't report it by name), so it
 * naturally becomes "active" once the real four are done and stays that way until the
 * final frame resolves the whole call. The mobile app can't read a streamed body, so it
 * calls the same endpoints in plain JSON mode instead.
 */
async function fetchRoundWithProgress(
  url: string,
  body: Record<string, unknown>,
  onProgress: (label: string, stages: LoadingStage[]) => void,
): Promise<GameRoundResult> {
  const completedStages = new Set<string>();
  const updateProgress = () => {
    const activeIndex = ROUND_STAGE_ORDER.findIndex((entry) => !completedStages.has(entry.stage));
    const stages = ROUND_STAGE_ORDER.map((entry, index) => ({
      ...entry,
      done: completedStages.has(entry.stage),
      active: index === activeIndex,
    }));
    onProgress(stages[activeIndex]?.label ?? "Preparing greeting…", stages);
  };
  updateProgress();

  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  let finalFrame: Record<string, unknown> | null = null;
  await readSseFrames(res, (frame) => {
    if (frame.done) {
      finalFrame = frame;
      return;
    }
    if (typeof frame.stage === "string") {
      completedStages.add(frame.stage);
      updateProgress();
    }
  });

  if (!finalFrame) throw new Error(`Stream from ${url} ended without a final frame`);
  return parseGameRoundResult(finalFrame, url);
}

/**
 * The web app's guessing-game hook: the shared useGameSession state machine (see
 * packages/shared/src/useGameSession.ts, also used by the mobile app) plus what's specific
 * to the browser — SSE-streamed round progress, localStorage persistence, the shared
 * audio player with its `audioEnabled` preference, and chat scroll/focus. Audio playback
 * mirrors useChatController.ts exactly, so the game has full audio parity with ordinary
 * chat, see CLAUDE.md's "Guessing game" section.
 */
export function useGameController() {
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
      fetchRoundWithProgress("/api/game/start", {}, (label, stages) => {
        setStartProgressMessage(label);
        setStartProgressStages(stages);
      }),
    continueRound: (gameToken) =>
      fetchRoundWithProgress("/api/game/continue", { gameToken }, (label, stages) => {
        setContinueProgressMessage(label);
        setContinueProgressStages(stages);
      }),
    sendMessage: (request) => postGame("/api/game/message", request),
    giveUp: (gameToken) => postGame("/api/game/give-up", { gameToken }),
    getHighScore: () => authenticatedFetch("/api/game/high-score").then((res) => res.json()),
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
    sendMessage,
    startGame: startSession,
    continueRound: continueSession,
  } = session;

  useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading });

  const replayMessageAudio = useCallback(
    async (message: Message) => {
      if (message.sender === "User") return;
      try {
        await playAudio(
          getReplayAudioUrl({
            audioFileUrl: message.audioFileUrl,
            text: message.text,
            botName: message.sender,
            gender: message.sender === currentCharacterName ? gender : null,
          }),
        );
      } catch (err) {
        logGameEvent("error", "game_audio_replay_error", "Failed to replay message audio", err);
      }
    },
    [currentCharacterName, gender, playAudio],
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
  };
}
