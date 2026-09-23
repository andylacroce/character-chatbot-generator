import { useEffect, useRef } from "react";
import { useGameSession, type GameLogger } from "character-chatbot-shared";
import {
  continueGame,
  getGameHighScore,
  giveUpGame,
  sendGameMessage,
  startGame as startGameRequest,
} from "./api";
import { loadGameState, saveGameState } from "./storage";
import { useAuth } from "./AuthContext";
import { useReplyAudio } from "./useReplyAudio";

const transport = {
  start: startGameRequest,
  continueRound: continueGame,
  sendMessage: sendGameMessage,
  giveUp: giveUpGame,
  getHighScore: getGameHighScore,
};
const storage = { load: loadGameState, save: saveGameState };
const log: GameLogger = (level, event, message, error) =>
  console[level](`[Game] ${event}: ${message}`, error);

/**
 * The mobile guessing-game hook: the same useGameSession state machine the web app uses
 * (packages/shared/src/useGameSession.ts), with plain-JSON requests, AsyncStorage
 * persistence, and native reply audio.
 */
export function useGameController() {
  const auth = useAuth();
  const audio = useReplyAudio();
  const session = useGameSession({
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
