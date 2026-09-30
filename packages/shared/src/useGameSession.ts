/**
 * The guessing games' client state machine, shared by the web app (app/components/
 * useGameController.ts) and the mobile app (apps/mobile/src/useGameController.ts), and by
 * both games ("Guess Who" and "Guess Who's Next", told apart by their `GameDefinition`). It
 * owns every piece of run state, its persistence, and the start/message/continue/give-up/
 * quit flows. Each platform supplies only what genuinely differs: how requests are sent
 * (`transport` — the web streams real progress over SSE, mobile uses plain JSON), where the
 * run is stored (`storage` — sync localStorage or async AsyncStorage), and how failures are
 * logged. Audio, scrolling and focus stay in each platform's own wrapper hook.
 *
 * There's no separate "guess" action: every chat turn goes through the message endpoint and
 * the server classifies it, see applyGameMessageResponse in game.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyGameMessageResponse,
  GAME_FALLBACK_AVATAR,
  gameRoundGreeting,
  giveUpEvent,
  MYSTERY_SPEAKER,
  revealedSpeaker,
  revealGameMessages,
  toGameConversationHistory,
  type GameDefinition,
  type GameEvent,
  type GameMessage,
  type GameTransport,
  type PersistedGameState,
} from "./game";
import type { GameRoundResult, GameSpeaker } from "./types";

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

const NO_SPEAKER: GameSpeaker = { name: "", avatarUrl: GAME_FALLBACK_AVATAR, gender: null };

/** Shared guessing-game state machine, see module doc above. */
export function useGameSession(
  game: GameDefinition,
  { transport, storage, log, identityKey, onQuit }: UseGameSessionOptions,
) {
  // Held in a ref so callers can pass fresh objects each render without re-creating
  // callbacks; refreshed after each render (every use is in an effect or an event handler).
  const deps = useRef({ transport, storage, log, onQuit });
  useEffect(() => {
    deps.current = { transport, storage, log, onQuit };
  });

  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  // The round's shown chat partner. Unused by a hidden-speaker game, whose speaker is
  // derived from the reveal event instead (see `speaker` below).
  const [heldSpeaker, setHeldSpeaker] = useState<GameSpeaker>(NO_SPEAKER);
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

  // Who the header and avatar show: a shown-speaker game's held partner; a hidden-speaker
  // game's mystery placeholder until a correct guess or game-over reveals the real identity.
  const speaker = game.hidesSpeaker ? (revealedSpeaker(lastEvent) ?? MYSTERY_SPEAKER) : heldSpeaker;

  // Resume a stored run once on mount. A lost/cleared token just means the start screen.
  useEffect(() => {
    let cancelled = false;
    const apply = (persisted: PersistedGameState | null) => {
      if (cancelled) return;
      if (persisted) {
        setToken(persisted.token);
        setHeldSpeaker({
          name: persisted.currentCharacterName ?? "",
          avatarUrl: persisted.avatarUrl ?? GAME_FALLBACK_AVATAR,
          gender: persisted.gender ?? null,
        });
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
      token
        ? {
            token,
            ...(game.hidesSpeaker
              ? {}
              : {
                  currentCharacterName: heldSpeaker.name,
                  avatarUrl: heldSpeaker.avatarUrl,
                  gender: heldSpeaker.gender,
                }),
            streak,
            messages,
            roundStartIndex,
            lastEvent,
          }
        : null,
    );
  }, [
    hydrated,
    game.hidesSpeaker,
    token,
    heldSpeaker,
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
          `${game.eventPrefix}_high_score_fetch_failed`,
          "Failed to load personal best",
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [identityKey, game.eventPrefix]);

  /** Applies a freshly generated round, starting its transcript slice at `roundBaseIndex`. */
  const applyRound = useCallback(
    (round: GameRoundResult, roundBaseIndex: number) => {
      setMessages((prev) => [...prev.slice(0, roundBaseIndex), gameRoundGreeting(game, round)]);
      setRoundStartIndex(roundBaseIndex);
      setToken(round.token);
      if (round.speaker) setHeldSpeaker(round.speaker);
      setStreak(round.streak);
      setLastEvent(null);
    },
    [game],
  );

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
      deps.current.log("error", `${game.eventPrefix}_client_start_failed`, msg, e);
    } finally {
      setStarting(false);
    }
  }, [applyRound, game.eventPrefix]);

  /** Ends the current run and clears all local game state. */
  const quitGame = useCallback(() => {
    deps.current.onQuit?.();
    setToken(null);
    setHeldSpeaker(NO_SPEAKER);
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
      if (!confirmed || !token) return;
      setLoading(true);
      setError("");
      try {
        const data = await deps.current.transport.giveUp(token);
        const event = giveUpEvent(game, data);
        setLastEvent(event);
        // No new reply message is generated on give-up, so a hidden-speaker round's
        // transcript is only ever revealed here, not via a reply.
        const revealed = game.hidesSpeaker ? revealedSpeaker(event) : null;
        if (revealed) {
          setMessages((prev) => revealGameMessages(prev, roundStartIndex, revealed));
        }
        setToken(null);
      } catch (e) {
        const msg = "Failed to give up. Please try again.";
        setError(msg);
        deps.current.log("error", `${game.eventPrefix}_client_give_up_failed`, msg, e);
      } finally {
        setLoading(false);
      }
    },
    [token, roundStartIndex, game],
  );

  /** Sends the player's message, question or guess alike, and applies the outcome. */
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !token || loading || lastEvent?.type === "correct" || continuing) return;
    const userMessage: GameMessage = { sender: "User", text: input };
    const history = toGameConversationHistory(messages.slice(roundStartIndex));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");
    setLastEvent(null);
    try {
      const data = await deps.current.transport.sendMessage({
        token,
        message: userMessage.text,
        conversationHistory: history,
      });
      const outcome = applyGameMessageResponse(game, data, speaker);
      if (outcome.giveUpRequested) {
        setGiveUpRequested(true);
        return;
      }
      setLastEvent(outcome.lastEvent);
      if (outcome.token !== undefined) setToken(outcome.token);
      const newStreak = outcome.newStreak;
      if (newStreak !== undefined) {
        setHighScore((prev) => (prev === null ? newStreak : Math.max(prev, newStreak)));
      }
      const reply = outcome.reply;
      const revealed = game.hidesSpeaker ? revealedSpeaker(outcome.lastEvent) : null;
      setMessages((prev) => {
        // A correct guess or game-over reveals a hidden-speaker round's identity, so
        // retroactively swap every earlier mystery-sender message in this round over too,
        // not just the reaction reply (which already carries the revealed identity), so the
        // whole round reads correctly once solved.
        const current = revealed ? revealGameMessages(prev, roundStartIndex, revealed) : prev;
        return reply ? [...current, reply] : current;
      });
    } catch (e) {
      const msg = "Failed to get a reply. Please try again.";
      setError(msg);
      deps.current.log("error", `${game.eventPrefix}_client_message_failed`, msg, e);
    } finally {
      setLoading(false);
    }
  }, [input, token, loading, lastEvent, continuing, messages, roundStartIndex, speaker, game]);

  /**
   * After a correct guess, generates the next round. That round genuinely isn't generated
   * before this, so judging a guess stays fast. On failure the "Correct!" banner comes back
   * so the player can retry.
   */
  const continueRound = useCallback(async () => {
    if (!token || lastEvent?.type !== "correct") return;
    const correctEvent = lastEvent;
    const roundBaseIndex = messages.length;
    setLastEvent(null);
    setContinuing(true);
    setError("");
    try {
      const round = await deps.current.transport.continueRound(token);
      applyRound(round, roundBaseIndex);
    } catch (e) {
      setLastEvent(correctEvent);
      const msg = "Failed to continue to the next round. Please try again.";
      setError(msg);
      deps.current.log("error", `${game.eventPrefix}_client_continue_failed`, msg, e);
    } finally {
      setContinuing(false);
    }
  }, [token, lastEvent, messages, applyRound, game.eventPrefix]);

  const clearGiveUpRequest = useCallback(() => setGiveUpRequested(false), []);

  return {
    started: token !== null,
    starting,
    token,
    /** Who the header shows: the named partner, or the mystery placeholder until revealed. */
    speaker,
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
