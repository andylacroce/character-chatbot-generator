import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession as useAuthSession } from "next-auth/react";
import { authenticatedFetch } from "../../../utils/api";
import { useSession } from "../account/useSession";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import { useAudioPlayer } from "./useAudioPlayer";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useMobileKeyboardViewportAdjustment } from "./useMobileKeyboardViewportAdjustment";
import { useChatVisiblePagination, INITIAL_VISIBLE_COUNT } from "./useChatVisiblePagination";
import { useAutoPlayLatestMessage } from "./useAutoPlayLatestMessage";
import { downloadChatTranscript } from "./chatTranscript";
import { getStoredUserName, safeFocus, useLogMessage } from "./chatControllerHelpers";
import { logChat, saveRefreshedBot, webChatStorage, webChatTransport } from "./chatAdapters";
import storage from "../../../utils/storage";
import type { Message } from "../../../types/message";
import type { Bot } from "../character/BotCreator";
import {
  STORAGE_KEYS,
  chatErrorMessage,
  chatHistoryKey,
  getReplayAudioUrl,
  useChatSession,
} from "character-chatbot-shared";

/**
 * Web chat controller: wires the shared chat session (transcript, send, intro, history
 * reconcile, voice config; see `useChatSession`) to the browser's audio, speech input, scroll,
 * focus and transcript download.
 */
export function useChatController(
  bot: Bot,
  onBackToCharacterCreation?: () => void,
  userName?: string,
) {
  const historyKey = chatHistoryKey(bot.name);
  const [input, setInput] = useState<string>("");
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    try {
      const savedAudioPreference = storage.getItem(STORAGE_KEYS.audioEnabled);
      if (savedAudioPreference !== null) return savedAudioPreference === "true";
    } catch {}
    return true;
  });
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);
  const [sessionId, sessionDatetime] = useSession();
  const { status: authStatus } = useAuthSession();
  const audioEnabledRef = useRef(audioEnabled);
  const chatBoxRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logMessage = useLogMessage(sessionId, sessionDatetime);

  const {
    messages,
    sending: loading,
    retrying,
    error,
    setError,
    introLoading,
    introError,
    send,
    ensureVoiceConfig,
  } = useChatSession({
    bot,
    userName: getStoredUserName(),
    authStatus:
      authStatus === "loading"
        ? "loading"
        : authStatus === "authenticated"
          ? "signedIn"
          : "signedOut",
    enabled: apiAvailable,
    transport: webChatTransport,
    storage: webChatStorage,
    log: logChat,
    onMessage: logMessage,
    onBotRefreshed: (refreshed) => saveRefreshedBot(refreshed, authStatus === "authenticated"),
  });

  useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading });

  const { visibleCount, setVisibleCount, handleScroll } = useChatVisiblePagination(
    chatBoxRef,
    messages.length,
    historyKey,
  );

  // Switching characters clears the draft and the visible-message window (the session resets
  // its own transcript, errors and intro).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setInput("");
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [bot.name, setVisibleCount]);
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
        logChat("error", "chat_audio_replay_error", "Failed to replay message audio", {
          botName: bot.name,
          error: err instanceof Error ? err.message : String(err),
        });
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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !apiAvailable || loading) return;
    const text = input;
    setInput("");
    stopRecording();
    await send(text);
  }, [input, apiAvailable, loading, stopRecording, send]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter that confirms an IME candidate (CJK input) must not send the half-composed text.
    if (
      e.key === "Enter" &&
      !e.nativeEvent?.isComposing &&
      !loading &&
      apiAvailable &&
      input.trim()
    ) {
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
        setError(chatErrorMessage(err));
      });
  }, [setError]);

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
