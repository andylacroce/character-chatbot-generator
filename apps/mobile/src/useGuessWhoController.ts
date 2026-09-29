import { useGuessWhoSession, type GuessWhoLogger } from "character-chatbot-shared";
import {
  getGuessWhoHighScore,
  giveUpGuessWho,
  startGuessWhoRound,
  submitGuessWhoGuess,
} from "./api";
import { loadGuessWhoState, saveGuessWhoState } from "./storage";
import { useAuth } from "./AuthContext";

const transport = {
  start: startGuessWhoRound,
  guess: submitGuessWhoGuess,
  giveUp: giveUpGuessWho,
  getHighScore: getGuessWhoHighScore,
};
const storage = { load: loadGuessWhoState, save: saveGuessWhoState };
const log: GuessWhoLogger = (level, event, message, error) =>
  console[level](`[GuessWho] ${event}: ${message}`, error);

/**
 * The mobile "Guess Who" hook: the same useGuessWhoSession state machine the web app
 * uses (packages/shared/src/useGuessWhoSession.ts), with plain-JSON requests and
 * AsyncStorage persistence. No audio — this game has no chat turns/TTS, unlike "Guess
 * Who's Next".
 */
export function useGuessWhoController() {
  const auth = useAuth();
  return useGuessWhoSession({
    transport,
    storage,
    log,
    identityKey: auth.status === "loading" ? null : auth.status,
  });
}
