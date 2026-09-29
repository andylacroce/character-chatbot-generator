/**
 * "Guess Who" (the clue-reveal game)'s client state machine, shared by the web app
 * (app/components/useGuessWhoController.ts) and the mobile app
 * (apps/mobile/src/useGuessWhoController.ts) — same adapter-pattern shape as
 * useGuessWhoNextSession.ts ({transport, storage, log, identityKey}) for consistency and
 * easy mobile reuse, but a separate hook: the state here (a clue list + reveal index, no
 * message transcript) is different enough from the chat game's model that a shared
 * generic hook across both would add more abstraction than it saves.
 *
 * There's no separate /continue endpoint (unlike "Guess Who's Next") — continuing to the
 * next round after a correct guess just calls `transport.start()` again, passing the
 * updated `usedNames`/`streak` forward, since round generation here is a single fast
 * Claude call rather than a multi-stage pipeline.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyGuessWhoResponse,
  GUESS_WHO_FALLBACK_AVATAR,
  type GuessWhoEvent,
  type PersistedGuessWhoState,
} from "./guessWho";
import type {
  GuessWhoGiveUpResponse,
  GuessWhoGuessResponse,
  GuessWhoHighScoreResponse,
  GuessWhoRoundResult,
} from "./types";

/** Network calls the session needs. Each rejects on failure; round results are pre-validated. */
export interface GuessWhoTransport {
  start(usedNames: string[], streak: number): Promise<GuessWhoRoundResult>;
  guess(guessWhoToken: string, guess: string): Promise<GuessWhoGuessResponse>;
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
  const [clue, setClue] = useState("");
  const [clueNumber, setClueNumber] = useState(0);
  const [totalClues, setTotalClues] = useState(0);
  const [streak, setStreak] = useState(0);
  const [usedNames, setUsedNames] = useState<string[]>([]);
  const [highScore, setHighScore] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState("");
  const [lastEvent, setLastEvent] = useState<GuessWhoEvent | null>(null);

  // Resume a stored run once on mount. A lost/cleared token just means the start screen.
  useEffect(() => {
    let cancelled = false;
    const apply = (persisted: PersistedGuessWhoState | null) => {
      if (cancelled) return;
      if (persisted) {
        setGuessWhoToken(persisted.guessWhoToken);
        setClue(persisted.clue);
        setClueNumber(persisted.clueNumber);
        setTotalClues(persisted.totalClues);
        setStreak(persisted.streak);
        setUsedNames(persisted.usedNames ?? []);
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
      guessWhoToken || lastEvent?.type === "correct"
        ? { guessWhoToken, clue, clueNumber, totalClues, streak, usedNames, lastEvent }
        : null,
    );
  }, [hydrated, guessWhoToken, clue, clueNumber, totalClues, streak, usedNames, lastEvent]);

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

  const applyRound = useCallback((round: GuessWhoRoundResult, names: string[]) => {
    setGuessWhoToken(round.guessWhoToken);
    setClue(round.clue);
    setClueNumber(round.clueNumber);
    setTotalClues(round.totalClues);
    setStreak(round.streak);
    setUsedNames(names);
    setLastEvent(null);
  }, []);

  /** Starts a brand-new streak, discarding any in-progress run. */
  const startGame = useCallback(async () => {
    setStarting(true);
    setError("");
    setLastEvent(null);
    try {
      const round = await deps.current.transport.start([], 0);
      applyRound(round, []);
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
    setClue("");
    setClueNumber(0);
    setTotalClues(0);
    setStreak(0);
    setUsedNames([]);
    setLastEvent(null);
    setError("");
    setGuess("");
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
          avatarUrl: data.avatarUrl || GUESS_WHO_FALLBACK_AVATAR,
          gender: data.gender,
          finalStreak: data.finalStreak,
        });
        setGuessWhoToken(null);
        setStreak(0);
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

  /** Submits the current guess input and applies the outcome. */
  const submitGuess = useCallback(async () => {
    if (!guess.trim() || !guessWhoToken || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await deps.current.transport.guess(guessWhoToken, guess.trim());
      setGuess("");
      const outcome = applyGuessWhoResponse(data);
      setLastEvent(outcome.event);
      if (outcome.guessWhoToken !== undefined) setGuessWhoToken(outcome.guessWhoToken);
      setStreak(outcome.streak);
      if (outcome.usedNames) setUsedNames(outcome.usedNames);
      if (outcome.event.type === "wrong") {
        setClue(outcome.event.clue);
        setClueNumber(outcome.event.clueNumber);
        setTotalClues(outcome.event.totalClues);
      }
      if (outcome.newStreak !== undefined) {
        setHighScore((prev) =>
          prev === null ? outcome.newStreak! : Math.max(prev, outcome.newStreak!),
        );
      }
    } catch (e) {
      const msg = "Failed to judge your guess. Please try again.";
      setError(msg);
      deps.current.log("error", "guess_who_client_guess_failed", msg, e);
    } finally {
      setLoading(false);
    }
  }, [guess, guessWhoToken, loading]);

  /** After a correct guess, starts the next round, carrying the streak/usedNames forward. */
  const continueRound = useCallback(async () => {
    if (lastEvent?.type !== "correct") return;
    const correctEvent = lastEvent;
    setContinuing(true);
    setError("");
    try {
      const round = await deps.current.transport.start(usedNames, correctEvent.streak);
      applyRound(round, usedNames);
    } catch (e) {
      setLastEvent(correctEvent);
      const msg = "Failed to continue to the next round. Please try again.";
      setError(msg);
      deps.current.log("error", "guess_who_client_continue_failed", msg, e);
    } finally {
      setContinuing(false);
    }
  }, [lastEvent, usedNames, applyRound]);

  return {
    started: guessWhoToken !== null || lastEvent?.type === "correct",
    starting,
    guessWhoToken,
    clue,
    clueNumber,
    totalClues,
    streak,
    highScore,
    guess,
    setGuess,
    loading,
    error,
    lastEvent,
    awaitingContinue: lastEvent?.type === "correct",
    displayedStreak: lastEvent?.type === "correct" ? lastEvent.streak : streak,
    continueRound,
    continuing,
    startGame,
    quitGame,
    giveUp,
    submitGuess,
  };
}

export type GuessWhoSession = ReturnType<typeof useGuessWhoSession>;
