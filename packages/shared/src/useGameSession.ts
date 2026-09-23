/**
 * The guessing game's client state machine, shared by the web app (app/components/
 * useGameController.ts) and the mobile app (apps/mobile/src/useGameController.ts). It owns
 * every piece of run state, its persistence, and the start/message/continue/give-up/quit
 * flows. Each platform supplies only what genuinely differs: how requests are sent
 * (`transport` — the web streams real progress over SSE, mobile uses plain JSON), where the
 * run is stored (`storage` — sync localStorage or async AsyncStorage), and how failures are
 * logged. Audio, scrolling and focus stay in each platform's own wrapper hook.
 *
 * There's no separate "guess" action: every chat turn goes through /game/message and the
 * server classifies it, see applyGameMessageResponse in game.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyGameMessageResponse,
  GAME_FALLBACK_AVATAR,
  roundGreeting,
  toGameConversationHistory,
  type GameEvent,
  type GameMessage,
  type PersistedGameState,
} from "./game";
import type {
  GameGiveUpResponse,
  GameHighScoreResponse,
  GameMessageRequest,
  GameMessageResponse,
  GameRoundResult,
} from "./types";

/** Network calls the session needs. Each rejects on failure; round results are pre-validated. */
export interface GameTransport {
  start(): Promise<GameRoundResult>;
  continueRound(gameToken: string): Promise<GameRoundResult>;
  sendMessage(request: GameMessageRequest): Promise<GameMessageResponse>;
  giveUp(gameToken: string): Promise<GameGiveUpResponse>;
  getHighScore(): Promise<GameHighScoreResponse>;
}

/** Where the in-progress run lives between visits. Either method may be sync or async. */
export interface GameStorage {
  load(): PersistedGameState | null | Promise<PersistedGameState | null>;
  save(state: PersistedGameState | null): void | Promise<void>;
}

export type GameLogger = (
  level: "warn" | "error",
  event: string,
  message: string,
  error: unknown,
) => void;

export interface UseGameSessionOptions {
  transport: GameTransport;
  storage: GameStorage;
  log: GameLogger;
  /**
   * Identifies who's playing (e.g. the sign-in status). The personal best is re-fetched
   * whenever it changes; `null` means "still resolving", so nothing is fetched yet.
   */
  identityKey: string | null;
  /** Called when the run is quit, e.g. to stop audio. */
  onQuit?: () => void;
}

/** Shared guessing-game state machine, see module doc above. */
export function useGameSession({
  transport,
  storage,
  log,
  identityKey,
  onQuit,
}: UseGameSessionOptions) {
  // Held in a ref so callers can pass fresh objects each render without re-creating
  // callbacks; refreshed after each render (every use is in an effect or an event handler).
  const deps = useRef({ transport, storage, log, onQuit });
  useEffect(() => {
    deps.current = { transport, storage, log, onQuit };
  });

  const [hydrated, setHydrated] = useState(false);
  const [gameToken, setGameToken] = useState<string | null>(null);
  const [currentCharacterName, setCurrentCharacterName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(GAME_FALLBACK_AVATAR);
  const [gender, setGender] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  // The personal best: null until one is on record. Bumped optimistically on a correct guess
  // (a streak only ever rises within a run) rather than re-fetched.
  const [highScore, setHighScore] = useState<number | null>(null);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [roundStartIndex, setRoundStartIndex] = useState(0);
  const [continuing, setContinuing] = useState(false);
  // Set when the server reads a chat message as a give-up; the UI opens its confirmation.
  const [giveUpRequested, setGiveUpRequested] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);

  // Resume a stored run once on mount. A lost/cleared token just means the start screen.
  useEffect(() => {
    let cancelled = false;
    const apply = (persisted: PersistedGameState | null) => {
      if (cancelled) return;
      if (persisted) {
        setGameToken(persisted.gameToken);
        setCurrentCharacterName(persisted.currentCharacterName);
        setAvatarUrl(persisted.avatarUrl);
        setGender(persisted.gender);
        setStreak(persisted.streak);
        setMessages(persisted.messages);
        setRoundStartIndex(persisted.roundStartIndex ?? 0);
        setLastEvent(persisted.lastEvent ?? null);
      }
      setHydrated(true);
    };
    const loaded = deps.current.storage.load();
    if (loaded instanceof Promise) loaded.then(apply, () => apply(null));
    else apply(loaded);
    return () => {
      cancelled = true;
    };
  }, []);

  // Not before hydration finishes, or an async load would be clobbered by the empty
  // initial state.
  useEffect(() => {
    if (!hydrated) return;
    void deps.current.storage.save(
      gameToken
        ? {
            gameToken,
            currentCharacterName,
            avatarUrl,
            gender,
            streak,
            messages,
            roundStartIndex,
            lastEvent,
          }
        : null,
    );
  }, [
    hydrated,
    gameToken,
    currentCharacterName,
    avatarUrl,
    gender,
    streak,
    messages,
    roundStartIndex,
    lastEvent,
  ]);

  useEffect(() => {
    if (identityKey === null) return;
    let cancelled = false;
    deps.current.transport
      .getHighScore()
      .then((data) => {
        if (!cancelled && typeof data?.highScore === "number") setHighScore(data.highScore);
      })
      .catch((err: unknown) => {
        deps.current.log(
          "warn",
          "game_high_score_fetch_failed",
          "Failed to load personal best",
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [identityKey]);

  /** Applies a freshly generated round, starting its transcript slice at `roundBaseIndex`. */
  const applyRound = useCallback((round: GameRoundResult, roundBaseIndex: number) => {
    setMessages((prev) => [...prev.slice(0, roundBaseIndex), roundGreeting(round)]);
    setRoundStartIndex(roundBaseIndex);
    setGameToken(round.gameToken);
    setCurrentCharacterName(round.currentCharacterName);
    setAvatarUrl(round.avatarUrl);
    setGender(round.gender ?? null);
    setStreak(round.streak);
  }, []);

  /** Starts a brand-new streak, discarding any in-progress run. */
  const startGame = useCallback(async () => {
    setStarting(true);
    setError("");
    setLastEvent(null);
    try {
      const round = await deps.current.transport.start();
      applyRound(round, 0);
      setGiveUpRequested(false);
    } catch (e) {
      const msg = "Failed to start a new game. Please try again.";
      setError(msg);
      deps.current.log("error", "game_client_start_failed", msg, e);
    } finally {
      setStarting(false);
    }
  }, [applyRound]);

  /** Ends the current run and clears all local game state. */
  const quitGame = useCallback(() => {
    deps.current.onQuit?.();
    setGameToken(null);
    setCurrentCharacterName("");
    setAvatarUrl(GAME_FALLBACK_AVATAR);
    setGender(null);
    setStreak(0);
    setMessages([]);
    setRoundStartIndex(0);
    setContinuing(false);
    setGiveUpRequested(false);
    setLastEvent(null);
    setError("");
  }, []);

  /** Gives up (once `confirmed`): reveals the hidden character and ends the run. */
  const giveUp = useCallback(
    async (confirmed = false) => {
      if (!confirmed || !gameToken) return;
      setLoading(true);
      setError("");
      try {
        const data = await deps.current.transport.giveUp(gameToken);
        setLastEvent({
          type: "gameover",
          revealedName: data.revealedName,
          finalStreak: data.finalStreak,
        });
        setGameToken(null);
      } catch (e) {
        const msg = "Failed to give up. Please try again.";
        setError(msg);
        deps.current.log("error", "game_client_give_up_failed", msg, e);
      } finally {
        setLoading(false);
      }
    },
    [gameToken],
  );

  /** Sends the player's message, question or guess alike, and applies the outcome. */
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !gameToken || loading || lastEvent?.type === "correct" || continuing)
      return;
    const userMessage: GameMessage = { sender: "User", text: input };
    const speaker = { name: currentCharacterName, avatarUrl };
    const history = toGameConversationHistory(messages.slice(roundStartIndex));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");
    setLastEvent(null);
    try {
      const data = await deps.current.transport.sendMessage({
        gameToken,
        message: userMessage.text,
        conversationHistory: history,
      });
      const outcome = applyGameMessageResponse(data, speaker);
      if (outcome.giveUpRequested) {
        setGiveUpRequested(true);
        return;
      }
      setLastEvent(outcome.lastEvent);
      if (outcome.gameToken !== undefined) setGameToken(outcome.gameToken);
      const newStreak = outcome.newStreak;
      if (newStreak !== undefined) {
        setHighScore((prev) => (prev === null ? newStreak : Math.max(prev, newStreak)));
      }
      const reply = outcome.reply;
      if (reply) setMessages((prev) => [...prev, reply]);
    } catch (e) {
      const msg = "Failed to get a reply. Please try again.";
      setError(msg);
      deps.current.log("error", "game_client_message_failed", msg, e);
    } finally {
      setLoading(false);
    }
  }, [
    input,
    gameToken,
    loading,
    lastEvent,
    continuing,
    messages,
    roundStartIndex,
    currentCharacterName,
    avatarUrl,
  ]);

  /**
   * After a correct guess, generates the revealed character's round. The next character
   * genuinely isn't generated before this, so judging a guess stays fast. On failure the
   * "Correct!" banner comes back so the player can retry.
   */
  const continueRound = useCallback(async () => {
    if (!gameToken || lastEvent?.type !== "correct") return;
    const correctEvent = lastEvent;
    const roundBaseIndex = messages.length;
    setLastEvent(null);
    setContinuing(true);
    setError("");
    try {
      const round = await deps.current.transport.continueRound(gameToken);
      applyRound(round, roundBaseIndex);
    } catch (e) {
      setLastEvent(correctEvent);
      const msg = "Failed to continue to the next round. Please try again.";
      setError(msg);
      deps.current.log("error", "game_client_continue_failed", msg, e);
    } finally {
      setContinuing(false);
    }
  }, [gameToken, lastEvent, messages, applyRound]);

  const clearGiveUpRequest = useCallback(() => setGiveUpRequested(false), []);

  return {
    started: gameToken !== null,
    starting,
    gameToken,
    currentCharacterName,
    avatarUrl,
    gender,
    streak,
    highScore,
    messages,
    input,
    setInput,
    loading,
    error,
    lastEvent,
    /** True once a correct guess is judged and awaiting "Continue". */
    awaitingContinue: lastEvent?.type === "correct",
    /** While awaiting Continue, the already-won streak; otherwise the current one. */
    displayedStreak: lastEvent?.type === "correct" ? lastEvent.streak : streak,
    continueRound,
    continuing,
    giveUpRequested,
    clearGiveUpRequest,
    startGame,
    quitGame,
    giveUp,
    sendMessage,
  };
}

export type GameSession = ReturnType<typeof useGameSession>;
