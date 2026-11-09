import React, { useState, useEffect, useRef, useCallback } from "react";
import { authenticatedFetch } from "../../../utils/api";
import { useSession } from "../account/useSession";
import { useApiError } from "../common/useApiError";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import { useAudioPlayer } from "./useAudioPlayer";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useCharacterVoiceConfig } from "./useCharacterVoiceConfig";
import { useMobileKeyboardViewportAdjustment } from "./useMobileKeyboardViewportAdjustment";
import { useChatVisiblePagination, INITIAL_VISIBLE_COUNT } from "./useChatVisiblePagination";
import { useAutoPlayLatestMessage } from "./useAutoPlayLatestMessage";
import { useChatIntro } from "./useChatIntro";
import { useServerHistoryReconcile } from "./useServerHistoryReconcile";
import { downloadChatTranscript } from "./chatTranscript";
import { getStoredUserName, safeFocus, useLogMessage } from "./chatControllerHelpers";
import storage from "../../../utils/storage";
import type { Message } from "../../../types/message";
import type { Bot } from "../character/BotCreator";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import {
  STORAGE_KEYS,
  buildChatRequest,
  chatHistoryKey,
  chatReplyMessage,
  getReplayAudioUrl,
  parseChatMessages,
  retryWithBackoff,
} from "character-chatbot-shared";

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
      if (saved) return parseChatMessages(JSON.parse(saved));
    } catch {}
    return [];
  });

  const { ensureVoiceConfig, voiceConfigRef } = useCharacterVoiceConfig(bot);

  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
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

  // Reset state when bot changes. This page is SSR'd, and this effect reads
  // localStorage (browser-only) to seed the reset, so it has to run post-mount rather
  // than during render — and it's a genuine "reset several independent pieces of state
  // together when the character identity changes" operation, not something any single
  // piece of state could be derived from during render instead. (The intro's and the
  // server-history gate's own state reset inside useChatIntro / useServerHistoryReconcile.)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Reset messages to load the new bot's chat history
    const newHistoryKey = chatHistoryKey(bot.name);
    try {
      const saved = storage.getItem(newHistoryKey);
      if (saved) {
        setMessages(parseChatMessages(JSON.parse(saved)));
      } else setMessages([]);
    } catch {
      setMessages([]);
    }

    // Clear any previous errors, retrying state, input, and loading state
    setError("");
    setRetrying(false);
    setInput("");
    setLoading(false);

    // Reset visible count
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [bot.name, setError, setVisibleCount]); // Only depend on bot.name to avoid unnecessary resets
  /* eslint-enable react-hooks/set-state-in-effect */

  const historyReconciled = useServerHistoryReconcile(bot.name, setMessages);

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

  const logMessage = useLogMessage(sessionId, sessionDatetime);

  const { introLoading, introError } = useChatIntro({
    bot,
    messageCount: messages.length,
    apiAvailable,
    historyReconciled,
    ensureVoiceConfig,
    logMessage,
    setError,
    setMessages,
  });

  const sendMessage = useCallback(async () => {
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
      const response = await retryWithBackoff(
        () =>
          authenticatedFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildChatRequest({
                bot,
                voiceConfig,
                message: currentInput,
                history: messages,
                userName: getStoredUserName(),
              }),
            ),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          }),
        {
          delayMs: process.env.NODE_ENV === "test" ? 10 : undefined,
          onAttempt: (attempt) => {
            if (attempt > 0) setRetrying(true);
            setError("");
          },
        },
      );
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        logEvent("info", "chat_send_retry_success", "Message send succeeded", {
          botName: bot.name,
        });
      }
      const botReply: Message = chatReplyMessage(bot.name, response);
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
      setRetrying(false);
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

  const handleDownloadTranscript = () => downloadChatTranscript(messages, bot, userName);

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
