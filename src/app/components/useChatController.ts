import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession as useAuthSession } from "next-auth/react";
import { downloadTranscript } from "../../utils/downloadTranscript";
import { authenticatedFetch } from "../../utils/api";
import { useSession } from "./useSession";
import { useApiError } from "./useApiError";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import { useAudioPlayer } from "./useAudioPlayer";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useCharacterVoiceConfig } from "./useCharacterVoiceConfig";
import { useMobileKeyboardViewportAdjustment } from "./useMobileKeyboardViewportAdjustment";
import { useChatVisiblePagination, INITIAL_VISIBLE_COUNT } from "./useChatVisiblePagination";
import { useAutoPlayLatestMessage } from "./useAutoPlayLatestMessage";
import storage from "../../utils/storage";
import type { Message } from "../../types/message";
import type { Bot } from "./BotCreator";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { STORAGE_KEYS, chatHistoryKey, getReplayAudioUrl } from "character-chatbot-shared";

/**
 * The visitor's own preferred name (see useUserName.ts), read directly from localStorage
 * here rather than threaded through as a prop — a signed-in user's server-stored value
 * takes precedence server-side once set, so the client never needs to know which source
 * will actually apply.
 */
function getStoredUserName(): string | undefined {
  return storage.getItem(STORAGE_KEYS.userName) || undefined;
}

/** Defers focusing an input to avoid synchronous DOM updates inside async callbacks. */
const safeFocus = (ref: React.RefObject<HTMLInputElement | null>) => {
  try {
    const el = ref?.current;
    if (!el || typeof el.focus !== "function") return;
    if (typeof document !== "undefined" && !document.contains(el)) return;
    setTimeout(() => {
      try {
        el.focus();
      } catch {}
    }, 0);
  } catch {}
};

/**
 * Chat controller hook that orchestrates chat state, API calls, audio, and logging for the chat
 * UI. Handles message history, retries, intro generation, transcript export, and audio playback.
 */
export function useChatController(
  bot: Bot,
  onBackToCharacterCreation?: () => void,
  userName?: string,
) {
  const historyKey = chatHistoryKey(bot.name);

  // Memoize messages loading from localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = storage.getItem(historyKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (m): m is Message =>
              m !== null &&
              typeof m === "object" &&
              typeof m.text === "string" &&
              typeof m.sender === "string",
          );
        }
      }
    } catch {}
    return [];
  });

  const { ensureVoiceConfig, voiceConfigRef } = useCharacterVoiceConfig(bot);

  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [introLoading, setIntroLoading] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    try {
      const savedAudioPreference = storage.getItem(STORAGE_KEYS.audioEnabled);
      if (savedAudioPreference !== null) return savedAudioPreference === "true";
    } catch {}
    return true;
  });
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);
  const [sessionId, sessionDatetime] = useSession();
  const { error, setError, handleApiError } = useApiError();
  const [introError, setIntroError] = useState<string | null>(null);
  const audioEnabledRef = useRef(audioEnabled);
  const [retrying, setRetrying] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading });

  const { visibleCount, setVisibleCount, handleScroll } = useChatVisiblePagination(
    chatBoxRef,
    messages.length,
    historyKey,
  );

  // See the reconciliation effect's own comment further down for what this gates.
  // Declared here (not next to that effect) for the same reason as visibleCount above.
  const { status: authStatus } = useAuthSession();
  const [historyReconciled, setHistoryReconciled] = useState(
    authStatus !== "loading" && authStatus !== "authenticated",
  );

  // Reset state when bot changes. This page is SSR'd, and this effect reads
  // localStorage (browser-only) to seed the reset, so it has to run post-mount rather
  // than during render — and it's a genuine "reset several independent pieces of state
  // together when the character identity changes" operation, not something any single
  // piece of state could be derived from during render instead.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Reset messages to load the new bot's chat history
    const newHistoryKey = chatHistoryKey(bot.name);
    try {
      const saved = storage.getItem(newHistoryKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(
          Array.isArray(parsed)
            ? parsed.filter(
                (m): m is Message =>
                  m !== null &&
                  typeof m === "object" &&
                  typeof m.text === "string" &&
                  typeof m.sender === "string",
              )
            : [],
        );
      } else setMessages([]);
    } catch {
      setMessages([]);
    }

    // Reset intro sent flag so new character gets introduction
    introSentRef.current = false;

    // Clear any previous errors
    setIntroError(null);
    setError("");

    // Reset retrying state
    setRetrying(false);

    // Reset input
    setInput("");

    // Reset loading state
    setLoading(false);
    setIntroLoading(false);

    // Reset visible count
    setVisibleCount(INITIAL_VISIBLE_COUNT);

    // A signed-in user's server history hasn't been checked yet for this
    // (possibly new) bot — see the reconciliation effect below, and the
    // intro effect that waits on it.
    setHistoryReconciled(false);
  }, [bot.name, setError, setVisibleCount]); // Only depend on bot.name to avoid unnecessary resets
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reconcile with server-persisted history (phase 3c). Local storage stays the fast,
  // instant-load cache for the common case; the server is the durable source of truth for
  // a signed-in user's saved character. Only adopts the server's list when it's strictly
  // longer than what's already loaded — the new-device / cleared-storage case — so this
  // never regresses a longer local list and never blocks the initial render. Guests (no
  // session) and a character that was never saved server-side both just get [] back from
  // the endpoint, a no-op.
  //
  // historyReconciled gates the intro-generation effect below: without it, a signed-in
  // user resuming a saved character on a device with no local cache would see
  // messages.length === 0 for the instant between mount and this fetch resolving, firing
  // a bogus "Introduce yourself" turn that then gets persisted server-side on top of the
  // character's real history — the exact bug this gate exists to prevent.
  // (authStatus/historyReconciled are declared up above, near visibleCount — see that comment.)
  /* eslint-disable react-hooks/set-state-in-effect -- authStatus is client-only auth
       session state; this effect can only run post-mount. */
  useEffect(() => {
    if (authStatus === "loading") return; // don't know yet whether there's server history to wait for
    if (authStatus !== "authenticated") {
      setHistoryReconciled(true);
      return;
    }
    let mounted = true;
    authenticatedFetch(`/api/messages?botName=${encodeURIComponent(bot.name)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !Array.isArray(data?.messages)) return;
        const serverMessages: Message[] = data.messages.filter(
          (m: unknown): m is Message =>
            m !== null &&
            typeof m === "object" &&
            typeof (m as Message).text === "string" &&
            typeof (m as Message).sender === "string",
        );
        setMessages((current) =>
          serverMessages.length > current.length ? serverMessages : current,
        );
      })
      .catch(() => {
        // Best-effort — local storage already has whatever this device has seen.
      })
      .finally(() => {
        if (mounted) setHistoryReconciled(true);
      });
    return () => {
      mounted = false;
    };
  }, [bot.name, authStatus]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { playAudio, stopAudio, isAudioPlaying, audioRef } = useAudioPlayer(audioEnabledRef);

  const {
    isSupported: isSpeechSupported,
    isRecording,
    transcript,
    error: speechError,
    stopRecording,
    toggleRecording,
  } = useSpeechRecognition();

  // Live-updates the input with the in-progress dictation. Overwrites rather than
  // appends to avoid interim-result flicker against already-typed text (see
  // ChatInput.tsx's mic button doc comment for the full rationale). Synchronizes React
  // state from useSpeechRecognition's own external browser-API state, which can't be
  // derived during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isRecording) setInput(transcript);
  }, [isRecording, transcript]);

  // Routes a speech-recognition error through the same banner ordinary chat errors use.
  useEffect(() => {
    if (speechError) setError(speechError);
  }, [speechError, setError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleMicToggle = useCallback(() => {
    if (loading) return;
    toggleRecording();
  }, [loading, toggleRecording]);

  const replayMessageAudio = useCallback(
    async (message: Message) => {
      if (message.sender === "User") return;
      try {
        const voiceConfig = message.audioFileUrl ? null : await ensureVoiceConfig();
        await playAudio(
          getReplayAudioUrl({
            audioFileUrl: message.audioFileUrl,
            text: message.text,
            botName: message.sender,
            gender: bot.gender,
            voiceConfig,
          }),
        );
      } catch (err) {
        if (typeof window !== "undefined") {
          logEvent(
            "error",
            "chat_audio_replay_error",
            "Failed to replay message audio",
            sanitizeLogMeta({
              botName: bot.name,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    },
    [bot.gender, bot.name, ensureVoiceConfig, playAudio],
  );

  // Sync audioEnabledRef with audioEnabled state and update muted property on active audio
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    // Also update muted state on any currently playing audio
    if (audioRef.current) {
      audioRef.current.muted = !audioEnabled;
    }
  }, [audioEnabled, audioRef]);

  // Fix TypeScript errors by explicitly typing parameters
  const profileApiCall = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const end = performance.now();
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        logEvent("info", "chat_api_timing", `${label} completed`, {
          duration: Math.round(end - start),
          operation: label,
        });
      }
    }
  };

  const logMessage = useCallback(
    async (message: Message) => {
      if (!sessionId || !sessionDatetime) return;
      try {
        await profileApiCall("Log Message", () =>
          authenticatedFetch("/api/log-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: message.sender,
              text: message.text,
              sessionId: sessionId,
              sessionDatetime: sessionDatetime,
            }),
          }).then((res) => {
            if (!res.ok) throw new Error("Log failed");
          }),
        );
      } catch (error) {
        if (typeof window !== "undefined") {
          logEvent(
            "warn",
            "client_log_message_failed",
            "Failed to log message to server",
            sanitizeLogMeta({
              error: error instanceof Error ? error.message : String(error),
              sender: message.sender,
              sessionId,
            }),
          );
        }
      }
    },
    [sessionId, sessionDatetime],
  );

  const introSentRef = useRef(false);
  const introRequestInProgressRef = useRef(false);
  useEffect(() => {
    // Prevent multiple concurrent requests (React Strict Mode protection)
    if (introSentRef.current || introRequestInProgressRef.current) return;
    // Wait until we know whether this (possibly signed-in, server-saved) character
    // already has real history — see the reconciliation effect above.
    if (!historyReconciled) return;
    if (messages.length === 0 && apiAvailable) {
      // introSentRef is a deliberate "ran once" guard against React Strict Mode's
      // double-invoke — reading then writing it within the same effect is exactly
      // the point (a real duplicate-intro-message bug was fixed this way). Setting
      // introLoading synchronously here (not in a callback) is what actually shows
      // the loading state before the async fetch below starts.
      /* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect */
      introSentRef.current = true;
      introRequestInProgressRef.current = true;
      setIntroLoading(true);
      /* eslint-enable react-hooks/immutability, react-hooks/set-state-in-effect */
      let cancelled = false;
      const getIntro = async () => {
        try {
          const voiceConfig = await ensureVoiceConfig();
          if (cancelled) return;
          if (!voiceConfig) {
            const msg = "Voice configuration missing for this character. Please recreate the bot.";
            if (!cancelled) {
              setIntroError(msg);
              setError(msg);
              setIntroLoading(false);
            }
            if (typeof window !== "undefined") {
              logEvent(
                "error",
                "chat_intro_voice_config_missing",
                msg,
                sanitizeLogMeta({
                  botName: bot.name,
                  hasVoiceConfig: !!bot.voiceConfig,
                }),
              );
            }
            return;
          }
          const response = await profileApiCall("Fetch Intro", () =>
            authenticatedFetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: "Introduce yourself in 2 sentences or less.",
                personality: bot.personality,
                botName: bot.name,
                voiceConfig,
                gender: bot.gender,
                conversationHistory: [],
                userName: getStoredUserName(),
                // This prompt is an internal mechanism to elicit an introduction, not
                // something the user typed — tells the server not to persist it as a
                // real "User" turn in a signed-in user's saved chat history.
                isIntro: true,
              }),
            }).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            }),
          );
          if (cancelled) return;
          if (typeof response.reply !== "string" || !response.reply) {
            throw new Error("Invalid intro response: missing reply");
          }
          const introMsg: Message = {
            sender: bot.name,
            text: response.reply,
            audioFileUrl: response.audioFileUrl,
          };
          setMessages([introMsg]);
          logMessage(introMsg);
          setIntroError(null);
          setIntroLoading(false);
        } catch (e) {
          if (cancelled) return;
          const msg = "Failed to generate intro or voice config. Please recreate the bot.";
          setIntroError(msg);
          setError(msg);
          setIntroLoading(false);
          if (typeof window !== "undefined") {
            logEvent(
              "error",
              "chat_intro_generation_failed",
              msg,
              sanitizeLogMeta({
                botName: bot.name,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        } finally {
          if (!cancelled) {
            introRequestInProgressRef.current = false;
          }
        }
      };
      getIntro();
      return () => {
        cancelled = true;
        introSentRef.current = false;
        introRequestInProgressRef.current = false;
      };
    }
  }, [
    messages.length,
    apiAvailable,
    bot,
    logMessage,
    setError,
    ensureVoiceConfig,
    historyReconciled,
  ]);

  const sendMessage = useCallback(async () => {
    /** Retries an async operation with exponential backoff. */
    async function retryWithBackoff<T>(
      fn: () => Promise<T>,
      maxRetries = 2,
      initialDelay = 800,
    ): Promise<T> {
      let delay = initialDelay;
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          setRetrying(true);
          if (process.env.NODE_ENV === "test") {
            await new Promise((res) => setTimeout(res, 10)); // Minimal delay in tests
          } else {
            await Promise.resolve();
          }
        }
        setError("");
        try {
          const result = await fn();
          if (process.env.NODE_ENV === "test") {
            await new Promise((res) => setTimeout(res, 1)); // Minimal delay in tests
          }
          setRetrying(false);
          return result;
        } catch (err: unknown) {
          lastError = err;
          if (attempt === maxRetries) {
            if (process.env.NODE_ENV === "test") {
              await new Promise((res) => setTimeout(res, 1)); // Minimal delay in tests
            }
            setRetrying(false);
            throw err;
          }
          if (process.env.NODE_ENV === "test") {
            await new Promise((res) => setTimeout(res, 10)); // Minimal delay in tests
          } else {
            await new Promise((res) => setTimeout(res, delay));
          }
          delay *= 2;
        }
      }
      setRetrying(false);
      throw lastError || new Error("Max retries reached");
    }

    if (!input.trim() || !apiAvailable || loading) return;
    const userMessage: Message = { sender: "User", text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const currentInput = input;
    setInput("");
    stopRecording();
    setLoading(true);
    setError("");
    logMessage(userMessage);
    try {
      const voiceConfig = await ensureVoiceConfig();
      if (!voiceConfig) {
        const msg = "Voice configuration missing for this character. Please recreate the bot.";
        setError(msg);
        if (typeof window !== "undefined") {
          logEvent(
            "error",
            "chat_send_voice_config_missing",
            msg,
            sanitizeLogMeta({
              botName: bot.name,
              hasVoiceConfig: !!bot.voiceConfig,
            }),
          );
        }
        setLoading(false);
        return;
      }
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        logEvent("info", "chat_send_retry_start", "Starting message send with retry logic", {
          botName: bot.name,
        });
      }
      // Convert messages to conversation history format for API
      const conversationHistory = messages
        .slice(-20)
        .map((msg) => (msg.sender === bot.name ? `Bot: ${msg.text}` : `User: ${msg.text}`));
      const response = await retryWithBackoff(
        () =>
          authenticatedFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: currentInput,
              personality: bot.personality,
              botName: bot.name,
              voiceConfig,
              gender: bot.gender,
              conversationHistory,
              userName: getStoredUserName(),
            }),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          }),
        2,
        800,
      );
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        logEvent("info", "chat_send_retry_success", "Message send succeeded", {
          botName: bot.name,
        });
      }
      if (typeof response.reply !== "string" || !response.reply) {
        throw new Error("Invalid chat response: missing reply");
      }
      const botReply: Message = {
        sender: bot.name,
        text: response.reply,
        audioFileUrl: response.audioFileUrl,
      };
      setMessages((prevMessages) => [...prevMessages, botReply]);
      logMessage(botReply);
    } catch (e) {
      const msg = "Failed to send message or generate reply.";
      setError(msg);
      handleApiError(new Error(msg));
      if (typeof window !== "undefined") {
        logEvent(
          "error",
          "chat_send_message_failed",
          msg,
          sanitizeLogMeta({
            botName: bot.name,
            error: e instanceof Error ? e.message : String(e),
            errorType: e instanceof Error ? e.constructor.name : typeof e,
            hasVoiceConfig: !!voiceConfigRef.current,
            messageCount: messages.length,
          }),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [
    input,
    apiAvailable,
    logMessage,
    loading,
    handleApiError,
    setError,
    bot,
    ensureVoiceConfig,
    messages,
    stopRecording,
    voiceConfigRef,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && apiAvailable && input.trim()) {
      sendMessage();
    }
  };

  const handleAudioToggle = useCallback(() => {
    setAudioEnabled((prev) => {
      const newEnabled = !prev;
      try {
        storage.setItem(STORAGE_KEYS.audioEnabled, String(newEnabled));
      } catch {}
      if (audioRef.current) {
        audioRef.current.muted = !newEnabled;
      }
      return newEnabled;
    });
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [audioRef, inputRef]);

  useEffect(() => {
    try {
      storage.setItem(STORAGE_KEYS.audioEnabled, String(audioEnabled));
    } catch {}
  }, [audioEnabled]);

  const healthCheckRan = useRef(false);
  useEffect(() => {
    if (healthCheckRan.current) return;
    healthCheckRan.current = true;
    authenticatedFetch("/api/health")
      .then(() => {
        setApiAvailable(true);
        safeFocus(inputRef);
      })
      .catch((err) => {
        setApiAvailable(false);
        handleApiError(err);
      });
  }, [handleApiError]);

  useEffect(() => {
    try {
      if (historyKey) storage.setItem(historyKey, JSON.stringify(messages));
    } catch {}
  }, [messages, historyKey]);

  const handleDownloadTranscript = async () => {
    try {
      await downloadTranscript(
        messages as Message[],
        { name: bot.name, avatarUrl: bot.avatarUrl },
        userName,
      );
      if (typeof window !== "undefined") {
        logEvent(
          "info",
          "chat_transcript_downloaded",
          "Transcript downloaded successfully",
          sanitizeLogMeta({
            botName: bot.name,
            messageCount: messages.length,
          }),
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      if (typeof window !== "undefined") {
        logEvent(
          "error",
          "chat_transcript_download_failed",
          "Failed to download transcript",
          sanitizeLogMeta({
            botName: bot.name,
            error: errorMessage,
            messageCount: messages.length,
          }),
        );
      }
      alert(`Failed to open transcript: ${errorMessage}`);
    }
  };

  const handleHeaderLinkClick = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  const handleBackToCharacterCreation = useCallback(() => {
    stopAudio();
    if (typeof onBackToCharacterCreation === "function") {
      onBackToCharacterCreation();
    }
  }, [stopAudio, onBackToCharacterCreation]);

  useMobileKeyboardViewportAdjustment(chatBoxRef, inputRef);

  useAutoPlayLatestMessage(messages, bot.name, playAudio, stopAudio);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  return {
    messages,
    input,
    setInput,
    loading,
    introLoading,
    audioEnabled,
    apiAvailable,
    introError,
    error,
    retrying,
    chatBoxRef,
    inputRef,
    visibleCount,
    handleDownloadTranscript,
    handleHeaderLinkClick,
    handleBackToCharacterCreation,
    handleScroll,
    sendMessage,
    handleKeyDown,
    handleAudioToggle,
    replayMessageAudio,
    stopAudio,
    isAudioPlaying,
    isSpeechSupported,
    isRecording,
    handleMicToggle,
  };
}
