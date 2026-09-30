import { useEffect, useMemo, useRef } from "react";
import { useGameSession, type GameDefinition, type GameLogger } from "character-chatbot-shared";
import { gameTransport } from "./api";
import { loadGameState, saveGameState } from "./storage";
import { useAuth } from "./AuthContext";
import { useReplyAudio } from "./useReplyAudio";

/**
 * The mobile guessing-game hook, for either game: the same useGameSession state machine the
 * web app uses (packages/shared/src/useGameSession.ts), with plain-JSON requests,
 * AsyncStorage persistence, and native reply audio.
 */
export function useGameController(game: GameDefinition) {
  const auth = useAuth();
  const audio = useReplyAudio();
  const transport = useMemo(() => gameTransport(game), [game]);
  const storage = useMemo(
    () => ({
      load: () => loadGameState(game),
      save: (state: Parameters<typeof saveGameState>[1]) => saveGameState(game, state),
    }),
    [game],
  );
  const log = useMemo<GameLogger>(
    () => (level, event, message, error) =>
      console[level](`[${game.title}] ${event}: ${message}`, error),
    [game],
  );
  const session = useGameSession(game, {
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
