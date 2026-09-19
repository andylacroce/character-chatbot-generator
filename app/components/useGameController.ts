import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../src/utils/api";
import storage from "../../src/utils/storage";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";
import type { Message } from "../../src/types/message";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { useAudioPlayer } from "./useAudioPlayer";
import { getReplayAudioUrl } from "../../src/utils/replayAudio";
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
  /**
   * Persisted so a reload while the "Correct!"/"Continue" banner is up re-shows it
   * identically, rather than silently dropping the player back into an ordinary-looking
   * chat with no visible sign they'd just won — the underlying `gameToken` is untouched
   * either way (see pages/api/game/message.ts's doc comment: a correct guess no longer
   * mutates the token at all, it just stays valid for /api/game/continue), so there's no
   * separate "held-back round data" to lose on reload the way there used to be.
   */
  lastEvent: GameEvent | null;
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
    lastEvent: state.lastEvent,
  });
}

/**
 * The real stages src/utils/gameRound.ts's generateGameRound reports as it runs, in
 * display order. Used to compute an honest progress label from genuine server-reported
 * "done" events (see fetchRoundWithProgress below) rather than a client-side timer
 * simulating stages that may not match what's actually happening.
 */
const ROUND_STAGE_ORDER: { stage: string; label: string }[] = [
  { stage: "personality", label: "Creating personality…" },
  { stage: "avatar", label: "Generating portrait…" },
  { stage: "reply", label: "Writing opening line…" },
  { stage: "voice", label: "Selecting voice…" },
];

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

/** The shape both /api/game/start and /api/game/continue resolve to — see fetchRoundWithProgress. */
interface RoundResult {
  gameToken: string;
  currentCharacterName: string;
  avatarUrl: string;
  gender: string | null;
  reply: string;
  audioFileUrl?: string;
  streak: number;
}

/**
 * Calls a round-generation endpoint (/api/game/start or /api/game/continue) in streamed
 * mode, reporting REAL progress to `onStageChange` as each named step of
 * src/utils/gameRound.ts's generateGameRound genuinely completes — not a client-side
 * timer simulating stages. `completedStages` accumulates as real "done" events arrive;
 * the label shown is always the first stage in ROUND_STAGE_ORDER not yet completed,
 * which naturally reflects personality/avatar (and reply/voice, which run concurrently
 * in pairs server-side) resolving in either order — whichever of a pair is still
 * outstanding is what's displayed, never a guess.
 */
async function fetchRoundWithProgress(
  url: string,
  body: Record<string, unknown>,
  onStageChange: (label: string) => void,
): Promise<RoundResult> {
  const completedStages = new Set<string>();
  const updateProgress = () => {
    const next = ROUND_STAGE_ORDER.find((entry) => !completedStages.has(entry.stage));
    onStageChange(next ? next.label : "Preparing greeting…");
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
  const result: Record<string, unknown> = finalFrame;
  if (typeof result.error === "string") throw new Error(result.error);
  if (
    typeof result.gameToken !== "string" ||
    typeof result.reply !== "string" ||
    typeof result.currentCharacterName !== "string"
  ) {
    throw new Error(`Invalid response from ${url}`);
  }
  return {
    gameToken: result.gameToken,
    currentCharacterName: result.currentCharacterName,
    avatarUrl: (result.avatarUrl as string) || "/silhouette.svg",
    gender: (result.gender as string | null) ?? null,
    reply: result.reply,
    audioFileUrl: result.audioFileUrl as string | undefined,
    streak: (result.streak as number) ?? 0,
  };
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
  const { status: sessionStatus } = useSession();
  const [gameToken, setGameToken] = useState<string | null>(null);
  const [currentCharacterName, setCurrentCharacterName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("/silhouette.svg");
  const [gender, setGender] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  // The signed-in user's personal best, fetched once per sign-in — null means either a
  // guest (who has no server-side record at all) or a signed-in user who hasn't beaten a
  // streak yet, and GamePage.tsx only shows the "Best" badge when this isn't null. Bumped
  // optimistically on a correct guess (see sendMessage below) rather than re-fetched, since
  // a streak only ever increases within a run, so a new streak beating the stored best is
  // always itself the new best.
  const [highScore, setHighScore] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Where the CURRENT round's conversation starts within `messages` — only messages from
  // this index onward are sent as context to the next /api/game/message call, so a newly
  // promoted chat partner isn't handed a previous character's unrelated Q&A. Earlier
  // rounds stay visible in the transcript for scrollback; they just aren't sent server-side.
  const [roundStartIndex, setRoundStartIndex] = useState(0);
  // True while /api/game/continue is generating the next character after a correct
  // guess — see continueRound below. Drives the same staged-progress UI as `starting`,
  // just for the round-advance path instead of a brand-new run.
  const [continuing, setContinuing] = useState(false);
  const [continueProgressMessage, setContinueProgressMessage] = useState("Starting…");
  // Set when the server classifies a chat message as an explicit give-up request (see
  // pages/api/game/message.ts) rather than an ordinary question or guess — GamePage.tsx
  // watches this to open its existing give-up confirmation dialog, the same one the
  // hamburger menu's "Give Up" button opens.
  const [giveUpRequested, setGiveUpRequested] = useState(false);
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
        if (typeof window !== "undefined") {
          logEvent(
            "error",
            "game_audio_replay_error",
            "Failed to replay message audio",
            sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      }
    },
    [currentCharacterName, gender, playAudio],
  );

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
      setLastEvent(persisted.lastEvent ?? null);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fetches the signed-in user's personal best once per sign-in — same
  // gate-on-"authenticated" shape as useUserName.ts's own server fetch. A guest never
  // calls this at all, matching "only shown if logged in": highScore simply stays null.
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    authenticatedFetch("/api/game/high-score")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && typeof data?.highScore === "number") setHighScore(data.highScore);
      })
      .catch((err: unknown) => {
        if (typeof window !== "undefined") {
          logEvent(
            "warn",
            "game_high_score_fetch_failed",
            "Failed to load personal best",
            sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  useEffect(() => {
    persistState(
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
    gameToken,
    currentCharacterName,
    avatarUrl,
    gender,
    streak,
    messages,
    roundStartIndex,
    lastEvent,
  ]);

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

  /**
   * Starts a brand-new streak, discarding any in-progress run. Drives `startProgressMessage`
   * from real server-reported progress (see fetchRoundWithProgress) rather than a
   * simulated timer.
   */
  const startGame = useCallback(async () => {
    setStarting(true);
    setError("");
    setLastEvent(null);
    try {
      const data = await fetchRoundWithProgress("/api/game/start", {}, setStartProgressMessage);
      setGameToken(data.gameToken);
      setCurrentCharacterName(data.currentCharacterName);
      setAvatarUrl(data.avatarUrl);
      setGender(data.gender);
      setStreak(data.streak);
      setMessages([
        {
          sender: data.currentCharacterName,
          text: data.reply,
          audioFileUrl: data.audioFileUrl,
          avatarUrl: data.avatarUrl,
        },
      ]);
      setRoundStartIndex(0);
      setGiveUpRequested(false);
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
    setContinuing(false);
    setGiveUpRequested(false);
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
    if (!input.trim() || !gameToken || loading || lastEvent?.type === "correct" || continuing)
      return;
    const userMessage: Message = { sender: "User", text: input };
    const previousCharacterName = currentCharacterName;
    // Captured now, before any round switch below — every reply this turn is still
    // spoken by the pre-switch character, so its message needs the pre-switch avatar,
    // not whatever `avatarUrl` state becomes after a correct guess promotes a new one.
    const previousAvatarUrl = avatarUrl;
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

      if (data.giveUpRequested) {
        setGiveUpRequested(true);
        return;
      }

      if (typeof data.reply !== "string" || !data.reply) {
        throw new Error("Invalid response from /api/game/message");
      }

      if (data.correct) {
        setLastEvent({ type: "correct", revealedName: data.revealedName, streak: data.streak });
        // A streak only ever increases within a run, so the moment it beats the stored
        // best IS the new best — no need to round-trip to /api/game/high-score to learn
        // that. Guarded on sessionStatus so a guest's highScore (always null) never
        // shows a "Best" badge it has no server-side record to back up.
        if (sessionStatus === "authenticated" && typeof data.streak === "number") {
          setHighScore((prev) => (prev === null ? data.streak : Math.max(prev, data.streak)));
        }
        setMessages((prev) => [
          ...prev,
          {
            sender: previousCharacterName,
            text: data.reply,
            audioFileUrl: data.audioFileUrl,
            avatarUrl: previousAvatarUrl,
          },
        ]);
        // Deliberately not touching gameToken/currentCharacterName/avatarUrl/streak or
        // roundStartIndex here — the next character isn't generated until the player
        // clicks "Continue" (see continueRound below), so judging a guess stays fast
        // instead of blocking on a full persona+avatar+voice+reply+TTS pipeline before
        // the player even sees they got it right (see pages/api/game/message.ts's doc
        // comment). The existing gameToken is untouched and still valid for that call.
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
          {
            sender: previousCharacterName,
            text: data.reply,
            audioFileUrl: data.audioFileUrl,
            avatarUrl: previousAvatarUrl,
          },
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
        {
          sender: previousCharacterName,
          text: data.reply,
          audioFileUrl: data.audioFileUrl,
          avatarUrl: previousAvatarUrl,
        },
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
    sessionStatus,
  ]);

  /**
   * Called once the player clicks "Continue" after a correct guess: generates the
   * newly-revealed character's own round (persona/avatar/voice/opening line) via
   * /api/game/continue, driving `continueProgressMessage` from the same real
   * server-reported progress `startGame` uses (see fetchRoundWithProgress) — the
   * generation genuinely hasn't started before this point, see sendMessage's `correct`
   * branch above and pages/api/game/message.ts's doc comment. On failure, restores the
   * "Correct!" banner so the player can retry rather than being stuck on a disabled
   * input with no way forward.
   */
  const continueRound = useCallback(async () => {
    if (!gameToken || lastEvent?.type !== "correct") return;
    const correctEvent = lastEvent;
    const roundBaseIndex = messages.length;
    setLastEvent(null);
    setContinuing(true);
    setError("");
    try {
      const data = await fetchRoundWithProgress(
        "/api/game/continue",
        { gameToken },
        setContinueProgressMessage,
      );
      setMessages((prev) => [
        ...prev,
        {
          sender: data.currentCharacterName,
          text: data.reply,
          audioFileUrl: data.audioFileUrl,
          avatarUrl: data.avatarUrl,
        },
      ]);
      setRoundStartIndex(roundBaseIndex);
      setGameToken(data.gameToken);
      setCurrentCharacterName(data.currentCharacterName);
      setAvatarUrl(data.avatarUrl);
      setGender(data.gender);
      setStreak(data.streak);
    } catch (e) {
      setLastEvent(correctEvent);
      const msg = "Failed to continue to the next round. Please try again.";
      setError(msg);
      if (typeof window !== "undefined") {
        logEvent(
          "error",
          "game_client_continue_failed",
          msg,
          sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }),
        );
      }
    } finally {
      setContinueProgressMessage("Starting…");
      setContinuing(false);
    }
  }, [gameToken, lastEvent, messages]);

  /** Dismisses a pending chat-detected give-up request once GamePage has acted on it. */
  const clearGiveUpRequest = useCallback(() => setGiveUpRequested(false), []);

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
    highScore,
    messages,
    input,
    setInput,
    loading,
    error,
    lastEvent,
    // True once a correct guess is judged and awaiting the player's "Continue" click —
    // the next character isn't generated until then (see continueRound), so this no
    // longer reflects "round data already fetched, just held back."
    awaitingContinue: lastEvent?.type === "correct",
    continueRound,
    continuing,
    continueProgressMessage,
    giveUpRequested,
    clearGiveUpRequest,
    chatBoxRef,
    inputRef,
    audioEnabled,
    handleAudioToggle,
    replayMessageAudio,
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
