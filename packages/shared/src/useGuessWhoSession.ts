/**
 * "Guess Who" (the self-describing chat game)'s client state machine, shared by the web
 * app (app/components/useGuessWhoController.ts) and the mobile app
 * (apps/mobile/src/useGuessWhoController.ts). Mirrors useGuessWhoNextSession.ts's
 * useGameSession shape closely (transport/storage/log/identityKey adapters, a message
 * transcript, SSE-vs-plain-JSON round generation left to each platform) but simpler:
 * there's no "currentCharacterName" — the character chatting is always the hidden one,
 * so no identity is tracked as top-level state; only a reveal event carries one.
 *
 * There's no separate "guess" action: every chat turn goes through /guess-who/message
 * and the server classifies it, see applyGuessWhoMessageResponse in guessWho.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyGuessWhoMessageResponse,
  guessWhoRoundGreeting,
  toGuessWhoConversationHistory,
  type GuessWhoEvent,
  type GuessWhoMessage,
  type PersistedGuessWhoState,
} from "./guessWho";
import type {
  GuessWhoGiveUpResponse,
  GuessWhoHighScoreResponse,
  GuessWhoMessageRequest,
  GuessWhoMessageResponse,
  GuessWhoRoundResult,
} from "./types";

/** Network calls the session needs. Each rejects on failure; round results are pre-validated. */
export interface GuessWhoTransport {
  start(): Promise<GuessWhoRoundResult>;
  continueRound(guessWhoToken: string): Promise<GuessWhoRoundResult>;
  sendMessage(request: GuessWhoMessageRequest): Promise<GuessWhoMessageResponse>;
  giveUp(guessWhoToken: string): Promise<GuessWhoGiveUpResponse>;
  getHighScore(): Promise<GuessWhoHighScoreResponse>;
}

/** Where the in-progress run lives between visits. Either method may be sync or async. */
export interface GuessWhoStorage {
  load(): PersistedGuessWhoState | null | Promise<PersistedGuessWhoState | null>;
  save(state: PersistedGuessWhoState | null): void | Promise<void>;
}

export type GuessWhoLogger = (
  level: "warn" | "error",
  event: string,
  message: string,
  error: unknown,
) => void;

export interface UseGuessWhoSessionOptions {
  transport: GuessWhoTransport;
  storage: GuessWhoStorage;
  log: GuessWhoLogger;
  /** Identifies who's playing; the personal best is re-fetched whenever it changes. `null` means "still resolving". */
  identityKey: string | null;
  onQuit?: () => void;
}

/** Shared "Guess Who" state machine, see module doc above. */
export function useGuessWhoSession({
  transport,
  storage,
  log,
  identityKey,
  onQuit,
}: UseGuessWhoSessionOptions) {
  const deps = useRef({ transport, storage, log, onQuit });
  useEffect(() => {
    deps.current = { transport, storage, log, onQuit };
  });

  const [hydrated, setHydrated] = useState(false);
  const [guessWhoToken, setGuessWhoToken] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  // The personal best: null until one is on record. Bumped optimistically on a correct
  // guess (a streak only ever rises within a run) rather than re-fetched.
  const [highScore, setHighScore] = useState<number | null>(null);
  const [messages, setMessages] = useState<GuessWhoMessage[]>([]);
  const [roundStartIndex, setRoundStartIndex] = useState(0);
  const [continuing, setContinuing] = useState(false);
  // Set when the server reads a chat message as a give-up; the UI opens its confirmation.
  const [giveUpRequested, setGiveUpRequested] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [lastEvent, setLastEvent] = useState<GuessWhoEvent | null>(null);

  // Resume a stored run once on mount. A lost/cleared token just means the start screen.
  useEffect(() => {
    let cancelled = false;
    const apply = (persisted: PersistedGuessWhoState | null) => {
      if (cancelled) return;
      if (persisted) {
        setGuessWhoToken(persisted.guessWhoToken);
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

  useEffect(() => {
    if (!hydrated) return;
    void deps.current.storage.save(
      guessWhoToken ? { guessWhoToken, streak, messages, roundStartIndex, lastEvent } : null,
    );
  }, [hydrated, guessWhoToken, streak, messages, roundStartIndex, lastEvent]);

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
          "guess_who_high_score_fetch_failed",
          "Failed to load personal best",
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [identityKey]);

  /** Applies a freshly generated round, starting its transcript slice at `roundBaseIndex`. */
  const applyRound = useCallback((round: GuessWhoRoundResult, roundBaseIndex: number) => {
    setMessages((prev) => [...prev.slice(0, roundBaseIndex), guessWhoRoundGreeting(round)]);
    setRoundStartIndex(roundBaseIndex);
    setGuessWhoToken(round.guessWhoToken);
    setStreak(round.streak);
    setLastEvent(null);
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
      deps.current.log("error", "guess_who_client_start_failed", msg, e);
    } finally {
      setStarting(false);
    }
  }, [applyRound]);

  /** Ends the current run and clears all local game state. */
  const quitGame = useCallback(() => {
    deps.current.onQuit?.();
    setGuessWhoToken(null);
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
      if (!confirmed || !guessWhoToken) return;
      setLoading(true);
      setError("");
      try {
        const data = await deps.current.transport.giveUp(guessWhoToken);
        setLastEvent({
          type: "gameover",
          revealedName: data.revealedName,
          avatarUrl: data.avatarUrl,
          gender: data.gender,
          finalStreak: data.finalStreak,
        });
        setGuessWhoToken(null);
      } catch (e) {
        const msg = "Failed to give up. Please try again.";
        setError(msg);
        deps.current.log("error", "guess_who_client_give_up_failed", msg, e);
      } finally {
        setLoading(false);
      }
    },
    [guessWhoToken],
  );

  /** Sends the player's message, question or guess alike, and applies the outcome. */
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !guessWhoToken || loading || lastEvent?.type === "correct" || continuing)
      return;
    const userMessage: GuessWhoMessage = { sender: "User", text: input };
    const history = toGuessWhoConversationHistory(messages.slice(roundStartIndex));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");
    setLastEvent(null);
    try {
      const data = await deps.current.transport.sendMessage({
        guessWhoToken,
        message: userMessage.text,
        conversationHistory: history,
      });
      const outcome = applyGuessWhoMessageResponse(data);
      if (outcome.giveUpRequested) {
        setGiveUpRequested(true);
        return;
      }
      setLastEvent(outcome.lastEvent);
      if (outcome.guessWhoToken !== undefined) setGuessWhoToken(outcome.guessWhoToken);
      const newStreak = outcome.newStreak;
      if (newStreak !== undefined) {
        setHighScore((prev) => (prev === null ? newStreak : Math.max(prev, newStreak)));
      }
      const reply = outcome.reply;
      if (reply) setMessages((prev) => [...prev, reply]);
    } catch (e) {
      const msg = "Failed to get a reply. Please try again.";
      setError(msg);
      deps.current.log("error", "guess_who_client_message_failed", msg, e);
    } finally {
      setLoading(false);
    }
  }, [input, guessWhoToken, loading, lastEvent, continuing, messages, roundStartIndex]);

  /**
   * After a correct guess, generates the next round's hidden character. The next
   * character genuinely isn't generated before this, so judging a guess stays fast. On
   * failure the "Correct!" banner comes back so the player can retry.
   */
  const continueRound = useCallback(async () => {
    if (!guessWhoToken || lastEvent?.type !== "correct") return;
    const correctEvent = lastEvent;
    const roundBaseIndex = messages.length;
    setLastEvent(null);
    setContinuing(true);
    setError("");
    try {
      const round = await deps.current.transport.continueRound(guessWhoToken);
      applyRound(round, roundBaseIndex);
    } catch (e) {
      setLastEvent(correctEvent);
      const msg = "Failed to continue to the next round. Please try again.";
      setError(msg);
      deps.current.log("error", "guess_who_client_continue_failed", msg, e);
    } finally {
      setContinuing(false);
    }
  }, [guessWhoToken, lastEvent, messages, applyRound]);

  const clearGiveUpRequest = useCallback(() => setGiveUpRequested(false), []);

  return {
    started: guessWhoToken !== null,
    starting,
    guessWhoToken,
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

export type GuessWhoSession = ReturnType<typeof useGuessWhoSession>;
