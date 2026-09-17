import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../src/utils/api";
import storage from "../../src/utils/storage";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";
import type { Message } from "../../src/types/message";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { useAudioPlayer } from "./useAudioPlayer";
import { useAudioEnabled } from "./useAudioEnabled";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";

/** A transient result banner shown after a guess is judged, see GamePage.tsx. */
export type GameEvent =
  | { type: "correct"; revealedName: string; streak: number }
  | { type: "wrong"; wrongGuessesRemaining: number }
  | { type: "gameover"; revealedName: string; finalStreak: number };

interface PersistedGameState {
  gameToken: string;
  currentCharacterName: string;
  avatarUrl: string;
  gender: string | null;
  streak: number;
  messages: Message[];
  /** Index into `messages` where the CURRENT round's conversation begins, see sendMessage below. */
  roundStartIndex: number;
}

/** Builds the "Bot: "/"User: "-prefixed history lines the server expects, from the transcript so far. */
function toConversationHistory(messages: Message[]): string[] {
  return messages.map((m) => (m.sender === "User" ? `User: ${m.text}` : `Bot: ${m.text}`));
}

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
  storage.setItem(STORAGE_KEYS.gameToken, state.gameToken);
  storage.setJSON(STORAGE_KEYS.gameTranscript, {
    currentCharacterName: state.currentCharacterName,
    avatarUrl: state.avatarUrl,
    gender: state.gender,
    streak: state.streak,
    messages: state.messages,
    roundStartIndex: state.roundStartIndex,
  });
}

/**
 * Drives the guessing game's client state: starting a run and sending every chat turn,
 * questions and guesses alike, through the same /api/game/message endpoint. There's no
 * separate "guess" action: the server classifies each message itself and, on a
 * confirmed guess, the response carries the outcome fields this hook reacts to. Audio
 * playback mirrors useChatController.ts exactly (same useAudioPlayer hook, same shared
 * `audioEnabled` preference) so the game has full audio parity with ordinary chat, see
 * CLAUDE.md's "Guessing game" section.
 */
export function useGameController() {
  const [gameToken, setGameToken] = useState<string | null>(null);
  const [currentCharacterName, setCurrentCharacterName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("/silhouette.svg");
  const [gender, setGender] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  // Where the CURRENT round's conversation starts within `messages` — only messages from
  // this index onward are sent as context to the next /api/game/message call, so a newly
  // promoted chat partner isn't handed a previous character's unrelated Q&A. Earlier
  // rounds stay visible in the transcript for scrollback; they just aren't sent server-side.
  const [roundStartIndex, setRoundStartIndex] = useState(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startProgressMessage, setStartProgressMessage] = useState("Starting…");
  const [error, setError] = useState("");
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading });

  const { audioEnabled, audioEnabledRef, toggleAudio: handleAudioToggle } = useAudioEnabled();
  const { playAudio, stopAudio, isAudioPlaying, audioRef } = useAudioPlayer(audioEnabledRef);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !audioEnabled;
  }, [audioEnabled, audioRef]);

  // Hydrate from localStorage once on mount, so a page refresh mid-game resumes rather
  // than silently restarting — a lost/cleared token just means the round can't resume,
  // which degrades to the ordinary "no active game" start screen. This page is SSR'd and
  // localStorage is browser-only, so this has to run post-mount rather than during render
  // — same shape as useChatController.ts's own bot-change reset effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      setGameToken(persisted.gameToken);
      setCurrentCharacterName(persisted.currentCharacterName);
      setAvatarUrl(persisted.avatarUrl);
      setGender(persisted.gender);
      setStreak(persisted.streak);
      setMessages(persisted.messages);
      setRoundStartIndex(persisted.roundStartIndex ?? 0);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    persistState(
      gameToken
        ? { gameToken, currentCharacterName, avatarUrl, gender, streak, messages, roundStartIndex }
        : null,
    );
  }, [gameToken, currentCharacterName, avatarUrl, gender, streak, messages, roundStartIndex]);

  const started = gameToken !== null;

  // Autoplay the latest bot message's audio, same dedupe-by-content-hash approach
  // useChatController.ts uses, just without persisting the last-played hash across
  // reloads — a lower-stakes game session doesn't need that extra durability.
  const lastPlayedHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender === "User" || typeof lastMsg.audioFileUrl !== "string") return;
    const hash = `${lastMsg.sender}__${lastMsg.text}__${lastMsg.audioFileUrl}`;
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
        logEvent(
          "error",
          "game_audio_playback_error",
          "Audio playback failed",
          sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
        );
      }
    });
    return () => {
      abortController.abort();
    };
  }, [messages, playAudio]);

  useEffect(() => stopAudio, [stopAudio]);

  /** Starts a brand-new streak, discarding any in-progress run. */
  const startGame = useCallback(async () => {
    setStarting(true);
    setError("");
    setLastEvent(null);
    setStartProgressMessage("Creating personality…");

    // Simulated staged progress to mirror bot creation's spinner UX (CLAUDE.md TODO #3).
    // The real /api/game/start call does persona+avatar+voice+reply in one pass, so we
    // cycle through representative messages client-side for visual consistency while the
    // request is in flight. Advances through the stages once and then holds on the last
    // one — avatar generation alone can easily run past the ~2.4s a single pass through
    // all four stages takes, and wrapping back around to "Creating personality…" reads as
    // the request having restarted rather than still being in flight.
    const stages = [
      "Creating personality…",
      "Generating portrait…",
      "Selecting voice…",
      "Preparing greeting…",
    ];
    let stage = 0;
    const stageInterval = setInterval(() => {
      if (stage >= stages.length - 1) return;
      stage += 1;
      setStartProgressMessage(stages[stage]);
    }, 600);

    try {
      const res = await authenticatedFetch("/api/game/start", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (
        typeof data.gameToken !== "string" ||
        typeof data.reply !== "string" ||
        typeof data.currentCharacterName !== "string"
      ) {
        throw new Error("Invalid response from /api/game/start");
      }
      setGameToken(data.gameToken);
      setCurrentCharacterName(data.currentCharacterName);
      setAvatarUrl(data.avatarUrl || "/silhouette.svg");
      setGender(data.gender ?? null);
      setStreak(data.streak ?? 0);
      setMessages([
        { sender: data.currentCharacterName, text: data.reply, audioFileUrl: data.audioFileUrl },
      ]);
      setRoundStartIndex(0);
    } catch (e) {
      const msg = "Failed to start a new game. Please try again.";
      setError(msg);
      if (typeof window !== "undefined") {
        logEvent(
          "error",
          "game_client_start_failed",
          msg,
          sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }),
        );
      }
    } finally {
      clearInterval(stageInterval);
      setStartProgressMessage("Starting…");
      setStarting(false);
    }
  }, []);

  /** Ends the current run and clears all local game state (does not affect the server's leaderboard record, if any). */
  const quitGame = useCallback(() => {
    stopAudio();
    setGameToken(null);
    setCurrentCharacterName("");
    setAvatarUrl("/silhouette.svg");
    setGender(null);
    setStreak(0);
    setMessages([]);
    setRoundStartIndex(0);
    setLastEvent(null);
    setError("");
  }, [stopAudio]);

  /**
   * Voluntarily gives up the current run: calls /api/game/give-up to decode the
   * token and reveal the hidden character, then ends the run exactly like the
   * two-wrong-guess game-over path — the player is always told the answer.
   */
  const giveUp = useCallback(
    async (confirmed = false) => {
      if (!confirmed) return;
      if (!gameToken) return;
      setLoading(true);
      setError("");
      try {
        const res = await authenticatedFetch("/api/game/give-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameToken }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLastEvent({
          type: "gameover",
          revealedName: data.revealedName,
          finalStreak: data.finalStreak,
        });
        setGameToken(null);
      } catch (e) {
        const msg = "Failed to give up. Please try again.";
        setError(msg);
        if (typeof window !== "undefined") {
          logEvent(
            "error",
            "game_client_give_up_failed",
            msg,
            sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }),
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [gameToken],
  );

  /**
   * Sends the player's message, question or guess alike, to the current chat partner.
   * The server itself decides whether it was a guess (see pages/api/game/message.ts);
   * this handles every possible outcome the response can carry.
   */
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !gameToken || loading) return;
    const userMessage: Message = { sender: "User", text: input };
    const previousCharacterName = currentCharacterName;
    const historyForServer = messages.slice(roundStartIndex);
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");
    setLastEvent(null);
    try {
      const res = await authenticatedFetch("/api/game/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameToken,
          message: userMessage.text,
          conversationHistory: toConversationHistory(historyForServer),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (typeof data.reply !== "string" || !data.reply) {
        throw new Error("Invalid response from /api/game/message");
      }

      if (data.correct) {
        setLastEvent({ type: "correct", revealedName: data.revealedName, streak: data.streak });
        setMessages((prev) => {
          const withReaction: Message[] = [
            ...prev,
            { sender: previousCharacterName, text: data.reply, audioFileUrl: data.audioFileUrl },
          ];
          return typeof data.nextReply === "string"
            ? [
                ...withReaction,
                {
                  sender: data.currentCharacterName,
                  text: data.nextReply,
                  audioFileUrl: data.nextAudioFileUrl,
                },
              ]
            : withReaction;
        });
        setRoundStartIndex(historyForServer.length + 2);
        setGameToken(data.gameToken);
        setCurrentCharacterName(data.currentCharacterName);
        setAvatarUrl(data.avatarUrl || "/silhouette.svg");
        setGender(data.gender ?? null);
        setStreak(data.streak ?? 0);
        return;
      }

      if (data.gameOver) {
        setLastEvent({
          type: "gameover",
          revealedName: data.revealedName,
          finalStreak: data.finalStreak,
        });
        setMessages((prev) => [
          ...prev,
          { sender: previousCharacterName, text: data.reply, audioFileUrl: data.audioFileUrl },
        ]);
        setGameToken(null);
        return;
      }

      if (data.wrongGuessesRemaining !== undefined) {
        setLastEvent({ type: "wrong", wrongGuessesRemaining: data.wrongGuessesRemaining });
        if (typeof data.gameToken === "string") setGameToken(data.gameToken);
      }
      setMessages((prev) => [
        ...prev,
        { sender: previousCharacterName, text: data.reply, audioFileUrl: data.audioFileUrl },
      ]);
    } catch (e) {
      const msg = "Failed to get a reply. Please try again.";
      setError(msg);
      if (typeof window !== "undefined") {
        logEvent(
          "error",
          "game_client_message_failed",
          msg,
          sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [input, gameToken, loading, messages, roundStartIndex, currentCharacterName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !loading && input.trim()) {
        sendMessage();
      }
    },
    [loading, input, sendMessage],
  );

  return {
    started,
    starting,
    gameToken,
    currentCharacterName,
    avatarUrl,
    gender,
    streak,
    messages,
    input,
    setInput,
    loading,
    error,
    lastEvent,
    chatBoxRef,
    inputRef,
    audioEnabled,
    handleAudioToggle,
    stopAudio,
    isAudioPlaying,
    startGame,
    quitGame,
    giveUp,
    startProgressMessage,
    sendMessage,
    handleKeyDown,
  };
}
