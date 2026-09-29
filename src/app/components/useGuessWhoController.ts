import { useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  parseGuessWhoRoundResult,
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
import { logEvent, sanitizeLogMeta } from "../../utils/logger";

export type { GuessWhoEvent } from "character-chatbot-shared";

/** Reads a persisted "Guess Who" round back from localStorage, or null if none is stored. */
function loadPersistedState(): PersistedGuessWhoState | null {
  return storage.getJSON<PersistedGuessWhoState>(STORAGE_KEYS.guessWhoState);
}

/** Persists (or clears, when `state` is null) the current round to localStorage. */
function persistState(state: PersistedGuessWhoState | null) {
  if (!state) {
    storage.removeItem(STORAGE_KEYS.guessWhoState);
    return;
  }
  storage.setJSON(STORAGE_KEYS.guessWhoState, state);
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

/** Starts (or continues, carrying `usedNames`/`streak` forward) a round. */
async function startRound(usedNames: string[], streak: number): Promise<GuessWhoRoundResult> {
  const raw = await postGuessWho("/api/guess-who/start", { usedNames, streak });
  return parseGuessWhoRoundResult(raw, "/api/guess-who/start");
}

/**
 * The web app's "Guess Who" hook: the shared useGuessWhoSession state machine (see
 * packages/shared/src/useGuessWhoSession.ts, also used by the mobile app) plus what's
 * specific to the browser — localStorage persistence and authenticatedFetch transport.
 * Deliberately no audio/TTS or speech-to-text — this game has no chat turns, and
 * round generation is a single fast Claude call, so there's no staged SSE progress
 * either (unlike "Guess Who's Next"'s useGuessWhoNextController.ts).
 */
export function useGuessWhoController() {
  const { status: sessionStatus } = useSession();

  const transport: GuessWhoTransport = {
    start: startRound,
    guess: (guessWhoToken, guess) => postGuessWho("/api/guess-who/guess", { guessWhoToken, guess }),
    giveUp: (guessWhoToken) => postGuessWho("/api/guess-who/give-up", { guessWhoToken }),
    getHighScore: () => authenticatedFetch("/api/guess-who/high-score").then((res) => res.json()),
  };

  const session = useGuessWhoSession({
    transport,
    storage: guessWhoStorage,
    log: logGuessWhoEvent,
    identityKey: sessionStatus === "loading" ? null : sessionStatus,
  });

  const { loading, guess, submitGuess: submitSessionGuess } = session;

  const submitGuess = useCallback(() => submitSessionGuess(), [submitSessionGuess]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !loading && guess.trim()) {
        submitGuess();
      }
    },
    [loading, guess, submitGuess],
  );

  return { ...session, submitGuess, handleKeyDown };
}
