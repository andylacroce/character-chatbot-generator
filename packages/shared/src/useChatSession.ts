/**
 * The one-on-one chat's client state machine, shared by the web app
 * (app/components/chat/useChatController.ts) and the mobile app (screens/ChatScreen.tsx).
 * It owns the transcript, the send flow (retry, stale-bot guard, error copy), the hidden
 * intro turn, reconciling with the server's saved history (the intro waits for sign-in to
 * resolve so it never fires over a real conversation), and the character's voice config.
 * Each platform supplies only what differs: `transport` (web's authenticatedFetch, mobile's
 * apiFetch), `storage` (localStorage vs AsyncStorage) and `log`. Audio, input, focus and
 * scrolling stay in each platform's own wrapper.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INTRO_PROMPT,
  buildChatRequest,
  chatErrorMessage,
  chatReplyMessage,
  longerHistory,
  retryWithBackoff,
} from "./chat";
import type { Bot, CharacterVoiceConfig, ChatMessage, ChatRequest, ChatResponse } from "./types";

/** A transcript turn; a bot reply may carry the URL of its synthesized audio. */
export type ChatTurn = ChatMessage & { audioFileUrl?: string };

/** The sign-in state the history reconcile waits on; "loading" holds the intro back. */
export type ChatAuthStatus = "loading" | "signedIn" | "signedOut";

/** How the chat reaches the backend. Rejections from `send` carry the HTTP `status` (see `httpError`). */
export interface ChatTransport {
  send(request: ChatRequest): Promise<ChatResponse>;
  /** A signed-in user's saved turns for this character. */
  fetchHistory(botName: string): Promise<ChatMessage[]>;
  fetchVoiceConfig(bot: Bot): Promise<CharacterVoiceConfig>;
}

/** Where a character's transcript (and optionally its voice config) lives on this device. */
export interface ChatStorage {
  load(botName: string): ChatTurn[] | Promise<ChatTurn[]>;
  save(botName: string, messages: ChatTurn[]): void | Promise<void>;
  loadVoiceConfig?(botName: string): CharacterVoiceConfig | null;
  saveVoiceConfig?(botName: string, config: CharacterVoiceConfig): void;
}

export type ChatLogger = (
  level: "info" | "warn" | "error",
  event: string,
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface UseChatSessionOptions {
  bot: Bot;
  userName?: string;
  authStatus: ChatAuthStatus;
  /** False while the platform knows the API is unreachable; holds back sends and the intro. */
  enabled?: boolean;
  transport: ChatTransport;
  storage: ChatStorage;
  log: ChatLogger;
  /** Called for every turn added during this session (web posts them to its message log). */
  onMessage?: (message: ChatTurn) => void;
  /** Called with a fresh reply's response, e.g. to play its audio. Not called for a stale reply. */
  onReply?: (response: ChatResponse) => void;
}

const VOICE_MISSING = "Voice configuration missing for this character. Please recreate the bot.";
const INTRO_FAILED = "Failed to generate intro or voice config. Please recreate the bot.";

/** Log fields for a caught error. */
function errorMeta(botName: string, err: unknown) {
  return {
    botName,
    error: err instanceof Error ? err.message : String(err),
    errorType: err instanceof Error ? err.constructor.name : typeof err,
  };
}

/** Shared one-on-one chat state machine, see module doc above. */
export function useChatSession(options: UseChatSessionOptions) {
  const { bot, authStatus, enabled = true } = options;
  // Latest options, refreshed after each render (every use is in an effect or a handler),
  // so callers can pass fresh objects without re-running effects.
  const live = useRef(options);
  useEffect(() => {
    live.current = options;
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A synchronous store (web) paints the transcript on the first render; an async one fills in later.
  const [initial] = useState(() => {
    try {
      const saved = options.storage.load(bot.name);
      if (Array.isArray(saved)) return saved;
    } catch {}
    return null;
  });
  const [messages, setMessages] = useState<ChatTurn[]>(initial ?? []);
  const messagesRef = useRef(messages);
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [introLoading, setIntroLoading] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);
  // Which bot the local transcript / the server reconcile have settled for. Compared with the
  // current bot so a switch can never act on the previous bot's state.
  const [loadedFor, setLoadedFor] = useState<string | null>(initial ? bot.name : null);
  const [reconciledFor, setReconciledFor] = useState<string | null>(null);
  const voiceRef = useRef<{ name: string; promise: Promise<CharacterVoiceConfig | null> } | null>(
    null,
  );

  /** Replaces the transcript for the current bot and saves it. */
  const commit = useCallback((list: ChatTurn[]) => {
    messagesRef.current = list;
    setMessages(list);
    const { storage, bot: current, log } = live.current;
    const failed = (err: unknown) =>
      log("warn", "chat_history_save_failed", "Failed to save chat history", {
        botName: current.name,
        error: err instanceof Error ? err.message : String(err),
      });
    try {
      void Promise.resolve(storage.save(current.name, list)).catch(failed);
    } catch (err) {
      failed(err);
    }
  }, []);

  /** The current character's voice config: cached, else the bot's own, else fetched (once). */
  const ensureVoiceConfig = useCallback((): Promise<CharacterVoiceConfig | null> => {
    const { bot: current, storage, transport, log } = live.current;
    if (voiceRef.current?.name === current.name) return voiceRef.current.promise;
    const promise = (async () => {
      try {
        const known = storage.loadVoiceConfig?.(current.name) ?? current.voiceConfig;
        if (known) return known;
        const fetched = await transport.fetchVoiceConfig(current);
        storage.saveVoiceConfig?.(current.name, fetched);
        return fetched;
      } catch (err) {
        voiceRef.current = null;
        log(
          "error",
          "voice_config_fetch_failed",
          "Failed to fetch voice config",
          errorMeta(current.name, err),
        );
        return null;
      }
    })();
    voiceRef.current = { name: current.name, promise };
    return promise;
  }, []);

  // Switching characters resets the session and loads the new transcript from this device.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const name = bot.name;
    let cancelled = false;
    sendingRef.current = false;
    setSending(false);
    setRetrying(false);
    setError("");
    setIntroError(null);
    setIntroLoading(false);
    const apply = (list: ChatTurn[]) => {
      if (cancelled) return;
      messagesRef.current = list;
      setMessages(list);
      setLoadedFor(name);
    };
    const failed = (err: unknown) => {
      live.current.log(
        "warn",
        "chat_history_load_failed",
        "Failed to load chat history",
        errorMeta(name, err),
      );
      apply([]);
    };
    try {
      const loaded = live.current.storage.load(name);
      if (loaded instanceof Promise) loaded.then(apply, failed);
      else apply(loaded);
    } catch (err) {
      failed(err);
    }
    return () => {
      cancelled = true;
    };
  }, [bot.name]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Adopt the server's copy when it is longer (new device / cleared storage). A guest has
  // nothing to wait for; while sign-in is unresolved the answer is unknown, so the intro waits.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const name = bot.name;
    if (authStatus === "signedOut") {
      setReconciledFor(name);
      return;
    }
    setReconciledFor(null);
    if (authStatus === "loading" || loadedFor !== name) return;
    let cancelled = false;
    live.current.transport
      .fetchHistory(name)
      .then((server) => {
        if (cancelled) return;
        const next = longerHistory(messagesRef.current, server);
        if (next !== messagesRef.current) commit(next);
      })
      .catch((err: unknown) => {
        live.current.log(
          "warn",
          "chat_history_reconcile_failed",
          "Failed to fetch saved chat history",
          errorMeta(name, err),
        );
      })
      .finally(() => {
        if (!cancelled) setReconciledFor(name);
      });
    return () => {
      cancelled = true;
    };
  }, [bot.name, authStatus, loadedFor, commit]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const ready = loadedFor === bot.name && reconciledFor === bot.name;
  const needsIntro = ready && enabled && messages.length === 0;

  // The character opens a fresh chat with a line of its own. The cleanup re-arms the effect
  // so React Strict Mode's double invoke still ends with exactly one live request.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!needsIntro) return;
    let cancelled = false;
    setIntroLoading(true);
    const fail = (message: string, err?: unknown) => {
      if (cancelled) return;
      setIntroError(message);
      setError(message);
      setIntroLoading(false);
      if (err !== undefined) {
        live.current.log(
          "error",
          "chat_intro_generation_failed",
          message,
          errorMeta(live.current.bot.name, err),
        );
      }
    };
    (async () => {
      try {
        const { bot: current, userName, transport } = live.current;
        const voiceConfig = await ensureVoiceConfig();
        if (cancelled) return;
        if (!voiceConfig) {
          live.current.log("error", "chat_intro_voice_config_missing", VOICE_MISSING, {
            botName: current.name,
            hasVoiceConfig: !!current.voiceConfig,
          });
          fail(VOICE_MISSING);
          return;
        }
        const response = await retryWithBackoff(
          () =>
            transport.send(
              buildChatRequest({
                bot: current,
                voiceConfig,
                message: INTRO_PROMPT,
                userName,
                isIntro: true,
              }),
            ),
          { delayMs: process.env.NODE_ENV === "test" ? 10 : undefined },
        );
        if (cancelled) return;
        const intro: ChatTurn = chatReplyMessage(current.name, response);
        commit([intro]);
        live.current.onMessage?.(intro);
        live.current.onReply?.(response);
        setIntroError(null);
        setIntroLoading(false);
      } catch (err) {
        fail(INTRO_FAILED, err);
      }
    })();
    return () => {
      cancelled = true;
      setIntroLoading(false);
    };
  }, [needsIntro, bot.name, commit, ensureVoiceConfig]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Sends one user turn and appends the character's reply. A reply for a bot no longer on screen is dropped. */
  const send = useCallback(
    async (text: string) => {
      const { bot: sentBot, userName, transport, log, onMessage, onReply } = live.current;
      if (!text.trim() || sendingRef.current || live.current.enabled === false) return;
      const stale = () => !alive.current || live.current.bot.name !== sentBot.name;
      const history = messagesRef.current;
      const userTurn: ChatTurn = { sender: "User", text };
      sendingRef.current = true;
      setSending(true);
      setError("");
      commit([...history, userTurn]);
      onMessage?.(userTurn);
      try {
        const voiceConfig = await ensureVoiceConfig();
        if (!voiceConfig) {
          if (!stale()) setError(VOICE_MISSING);
          log("error", "chat_send_voice_config_missing", VOICE_MISSING, {
            botName: sentBot.name,
            hasVoiceConfig: !!sentBot.voiceConfig,
          });
          return;
        }
        const response = await retryWithBackoff(
          () =>
            transport.send(
              buildChatRequest({
                bot: sentBot,
                voiceConfig,
                message: text,
                history,
                userName,
              }),
            ),
          {
            delayMs: process.env.NODE_ENV === "test" ? 10 : undefined,
            onAttempt: (attempt) => {
              if (stale()) return;
              if (attempt > 0) setRetrying(true);
              setError("");
            },
          },
        );
        if (stale()) return;
        const reply: ChatTurn = chatReplyMessage(sentBot.name, response);
        commit([...messagesRef.current, reply]);
        onMessage?.(reply);
        onReply?.(response);
      } catch (err) {
        if (!stale()) setError(chatErrorMessage(err));
        log("error", "chat_send_message_failed", "Failed to send message or generate reply.", {
          ...errorMeta(sentBot.name, err),
          hasVoiceConfig: !!sentBot.voiceConfig,
          messageCount: history.length,
        });
      } finally {
        if (!stale()) {
          sendingRef.current = false;
          setRetrying(false);
          setSending(false);
        }
      }
    },
    [commit, ensureVoiceConfig],
  );

  return {
    messages,
    sending,
    retrying,
    error,
    setError,
    introLoading,
    introError,
    send,
    ensureVoiceConfig,
  };
}
