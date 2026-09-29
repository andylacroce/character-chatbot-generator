import { useEffect, useRef } from "react";
import { useGuessWhoSession, type GuessWhoLogger } from "character-chatbot-shared";
import {
  continueGuessWho,
  getGuessWhoHighScore,
  giveUpGuessWho,
  sendGuessWhoMessage,
  startGuessWhoRound,
} from "./api";
import { loadGuessWhoState, saveGuessWhoState } from "./storage";
import { useAuth } from "./AuthContext";
import { useReplyAudio } from "./useReplyAudio";

const transport = {
  start: startGuessWhoRound,
  continueRound: continueGuessWho,
  sendMessage: sendGuessWhoMessage,
  giveUp: giveUpGuessWho,
  getHighScore: getGuessWhoHighScore,
};
const storage = { load: loadGuessWhoState, save: saveGuessWhoState };
const log: GuessWhoLogger = (level, event, message, error) =>
  console[level](`[GuessWho] ${event}: ${message}`, error);

/**
 * The mobile "Guess Who" hook: the same useGuessWhoSession state machine the web app
 * uses (packages/shared/src/useGuessWhoSession.ts), with plain-JSON requests,
 * AsyncStorage persistence, and native reply audio — mirrors
 * useGuessWhoNextController.ts, since this game is now a full chat with TTS like
 * "Guess Who's Next", not the old clue-only design.
 */
export function useGuessWhoController() {
  const auth = useAuth();
  const audio = useReplyAudio();
  const session = useGuessWhoSession({
    transport,
    storage,
    log,
    identityKey: auth.status === "loading" ? null : auth.status,
    onQuit: audio.stop,
  });

  // Speak each new reply once, keyed by its content (mirrors the web hook's autoplay).
  const lastPlayedRef = useRef<string | null>(null);
  const { messages } = session;
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.sender === "User" || !last.audioFileUrl) return;
    const key = `${last.sender}__${last.text}__${last.audioFileUrl}`;
    if (key === lastPlayedRef.current) return;
    lastPlayedRef.current = key;
    audio.play(last.audioFileUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  return { ...session, audio };
}
