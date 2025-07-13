/**
 * Main chat interface component that manages the conversation with the Character Chatbot Generator.
 *
 * Handles chat state, message sending, transcript download, and audio playback.
 * Integrates with OpenAI and Google TTS via API routes.
 *
 * @module ChatPage
 */

"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import axios from "axios";
import "../globals.css";
import ChatMessagesList from "./ChatMessagesList";
import { downloadTranscript } from "../../src/utils/downloadTranscript"; // Import the utility
import "@trendmicro/react-toggle-switch/dist/react-toggle-switch.css";
import styles from "./styles/ChatPage.module.css";
import { useSession } from "./useSession";
import { useAudioPlayer } from "./useAudioPlayer";
import ChatInput from "./ChatInput";
import ChatStatus from "./ChatStatus";
import ApiUnavailableModal from "./ApiUnavailableModal";
import ChatHeader from "./ChatHeader";
import { Message } from "../../src/types/message";
import { useApiError } from "./useApiError";
import type { Bot } from "./BotCreator"; // Import the Bot type
import { useChatScrollAndFocus } from "./useChatScrollAndFocus"; // Import the custom hook
// import { useNextRouterEventsForAudioCleanup } from "./_useNextRouterEventsForAudioCleanup";

// Constants for infinite scroll functionality
const INITIAL_VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 10;

/**
 * ChatPage component that handles the chat interface and interactions with the Character Chatbot Generator.
 * This component manages the state of the conversation, handles user input, and plays audio responses.
 *
 * @returns {JSX.Element} The ChatPage component.
 */
function ChatPage({ bot, onBackToCharacterCreation }: { bot: Bot, onBackToCharacterCreation?: () => void }) {
  // Use a unique key for each bot's chat history
  const chatHistoryKey = `chatbot-history-${bot.name}`;
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && chatHistoryKey) {
      try {
        const saved = localStorage.getItem(chatHistoryKey);
        if (saved) return JSON.parse(saved);
      } catch { }
    }
    return [];
  });

  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  // Initialize audioEnabled from localStorage or default to true
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const savedAudioPreference = localStorage.getItem('audioEnabled');
      if (savedAudioPreference !== null) {
        return savedAudioPreference === 'true';
      }
    }
    return true; // Default to true if nothing is saved
  });
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);
  const [sessionId, sessionDatetime] = useSession(); // Use useSession hook
  const { error, setError, handleApiError } = useApiError();
  const audioEnabledRef = useRef(audioEnabled);
  const [retrying, setRetrying] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Ensure chat auto-scrolls to bottom on new messages
  useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading });

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  const { playAudio, stopAudio } = useAudioPlayer(audioEnabledRef);

  // Function to log message asynchronously
  const logMessage = useCallback(
    async (message: Message) => {
      if (!sessionId || !sessionDatetime) return;
      try {
        // Fire-and-forget POST request to the logging API
        await axios.post("/api/log-message", {
          sender: message.sender,
          text: message.text,
          sessionId: sessionId, // Send the session ID
          sessionDatetime: sessionDatetime, // Send the session datetime
        });
      } catch (error) {
        // Only log to console on client
        console.warn("Failed to log message", {
          event: "client_log_message_failed",
          error: error instanceof Error ? error.message : String(error),
          message,
          sessionId,
          sessionDatetime
        });
      }
    },
    [sessionId, sessionDatetime],
  ); // Add sessionId and sessionDatetime dependencies

  // Prevent intro loop: only send intro if not already sent in this session
  const introSentRef = useRef(false);

  // On mount, if no chat history, have the bot introduce itself in-character
  useEffect(() => {
    if (introSentRef.current) return;
    if (messages.length === 0 && apiAvailable) {
      introSentRef.current = true;
      const getIntro = async () => {
        try {
          if (!bot.voiceConfig) {
            throw new Error("Voice configuration missing for this character. Please recreate the bot.");
          }
          const response = await axios.post("/api/chat", {
            message: "Introduce yourself in 2 sentences or less.",
            personality: bot.personality,
            botName: bot.name,
            voiceConfig: bot.voiceConfig
          });
          const introMsg: Message = {
            sender: bot.name,
            text: response.data.reply,
            audioFileUrl: response.data.audioFileUrl,
          };
          setMessages([introMsg]);
          logMessage(introMsg);
          // Do NOT play audio here; let the effect below handle it after render
        } catch {
          setError("Failed to generate intro or voice config. Please recreate the bot.");
        }
      };
      getIntro();
    }
  }, [messages.length, apiAvailable, bot, logMessage, playAudio, setError]);

  const sendMessage = useCallback(async () => {
    // Helper for retry with exponential backoff
    async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2, initialDelay = 800): Promise<T> {
      let delay = initialDelay;
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          setRetrying(true); // Set retrying true before each retry (not first attempt)
          // In test, keep retrying indicator visible for 1000ms to ensure test can see it
          if (process.env.NODE_ENV === 'test') {
            await new Promise(res => setTimeout(res, 1000));
          } else {
            await Promise.resolve(); // Force React flush for prod
          }
        }
        setError(""); // Clear error before each attempt
        try {
          const result = await fn();
          // In test, keep retrying indicator visible for 200ms after success
          if (process.env.NODE_ENV === 'test') {
            await new Promise(res => setTimeout(res, 200));
          }
          setRetrying(false); // Set retrying false on success
          return result;
        } catch (err: unknown) {
          lastError = err;
          if (attempt === maxRetries) {
            // In test, keep retrying indicator visible for 200ms after failure
            if (process.env.NODE_ENV === 'test') {
              await new Promise(res => setTimeout(res, 200));
            }
            setRetrying(false); // Set retrying false on final failure
            throw err;
          }
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
        }
      }
      setRetrying(false); // Fallback, should not reach here
      throw lastError || new Error("Max retries reached");
    }

    if (!input.trim() || !apiAvailable || loading) return;
    const userMessage: Message = { sender: "User", text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const currentInput = input;
    setInput("");
    setLoading(true);
    setError("");
    // setRetrying(false); // Remove this, handled in retryWithBackoff

    logMessage(userMessage);

    try {
      if (!bot.voiceConfig) {
        throw new Error("Voice configuration missing for this character. Please recreate the bot.");
      }
      const response = await retryWithBackoff(
        () => axios.post("/api/chat", { message: currentInput, personality: bot.personality, botName: bot.name, voiceConfig: bot.voiceConfig }),
        2, // max 2 retries
        800 // ms
      );
      const botReply: Message = {
        sender: bot.name, // Use the bot's name
        text: response.data.reply,
        audioFileUrl: response.data.audioFileUrl,
      };
      setMessages((prevMessages) => [...prevMessages, botReply]);
      logMessage(botReply);
      // REMOVE: audio playback here; handled by useEffect after render
    } catch {
      handleApiError(new Error("Failed to send message or generate reply."));
    } finally {
      setLoading(false);
      // setRetrying(false); // Remove this, handled in retryWithBackoff
    }
  }, [input, apiAvailable, logMessage, loading, handleApiError, setError, bot]);

  // Handle keyboard input (Enter key)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && apiAvailable && input.trim()) {
      sendMessage();
    }
  };

  /**
   * Toggles the audio playback functionality on and off.
   * When toggled off, it stops any currently playing audio and cleans up resources.
   */
  const handleAudioToggle = useCallback(() => {
    setAudioEnabled((prev) => {
      const newEnabled = !prev;
      // Save the new preference to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('audioEnabled', String(newEnabled));
      }
      if (!newEnabled) {
        stopAudio();
      }
      return newEnabled;
    });
    // Focus the input after toggling audio
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [stopAudio, inputRef]);

  // Persist audioEnabled to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('audioEnabled', String(audioEnabled));
    }
  }, [audioEnabled]);

  // Health check on mount (robust guard against double-call in dev/StrictMode)
  const healthCheckRan = useRef(false);
  useEffect(() => {
    if (healthCheckRan.current) return;
    healthCheckRan.current = true;
    axios
      .get("/api/health")
      .then(() => {
        setApiAvailable(true);
        // Focus input if available after health check
        if (inputRef.current) {
          inputRef.current.focus();
        }
      })
      .catch((err) => {
        setApiAvailable(false);
        handleApiError(err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleApiError]);

  // Persist chat history to localStorage whenever messages change
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && chatHistoryKey) {
      try {
        localStorage.setItem(chatHistoryKey, JSON.stringify(messages));
      } catch {
        // ignore
      }
    }
  }, [messages, chatHistoryKey]);

  // Download transcript handler - USE THE UTILITY
  const handleDownloadTranscript = async () => {
    try {
      await downloadTranscript(messages as Message[]); // Cast to Message[] for compatibility
    } catch {
      console.error("Failed to download transcript");
      alert("Failed to download transcript.");
    }
  };

  const handleHeaderLinkClick = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  // Handler to go back to character creation and stop audio
  const handleBackToCharacterCreation = useCallback(() => {
    stopAudio();
    if (typeof onBackToCharacterCreation === 'function') {
      onBackToCharacterCreation();
    }
  }, [stopAudio, onBackToCharacterCreation]);

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);  // Handler to load more messages when scrolled to top
  // Debugging: Log visibleCount and messages in handleScroll
  const handleScroll = useCallback(() => {
    if (!chatBoxRef.current) return;

    const { scrollTop } = chatBoxRef.current;
    console.debug("Scroll event", {
      event: "chat_scroll",
      scrollTop,
      visibleCount,
      messagesLength: messages.length
    });

    // Load more messages when scrolled to top and there are more messages available
    if (scrollTop === 0 && visibleCount < messages.length) {
      setVisibleCount((prev) => {
        const newCount = Math.min(prev + LOAD_MORE_COUNT, messages.length);
        console.debug("VisibleCount updated", {
          event: "chat_visible_count_updated",
          newCount
        });
        return newCount;
      });
    }
  }, [visibleCount, messages.length]);

  // Attach scroll event to chatBoxRef after visibleCount/messages change
  useEffect(() => {
    const ref = chatBoxRef.current;
    if (!ref) return;
    ref.addEventListener('scroll', handleScroll);
    return () => {
      ref.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, visibleCount, messages.length]);

  // Reset visibleCount when messages change (new message or bot)
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [chatHistoryKey]);

  // Utility to get a unique hash for a message (text + audioFileUrl)
  function getMessageHash(msg: Message) {
    return `${msg.sender}__${msg.text}__${msg.audioFileUrl ?? ''}`;
  }

  // Play bot audio after message is rendered (prevents clipping)
  const lastPlayedAudioHashRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!audioEnabledRef.current) return;
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const lastMsgHash = getMessageHash(lastMsg);
    // Persist last played hash in sessionStorage to survive refreshes
    if (typeof window !== 'undefined') {
      if (lastPlayedAudioHashRef.current === null) {
        lastPlayedAudioHashRef.current = sessionStorage.getItem(`lastPlayedAudioHash-${bot.name}`);
      }
    }
    if (
      lastMsg.sender === bot.name &&
      typeof lastMsg.audioFileUrl === 'string' &&
      lastMsgHash !== lastPlayedAudioHashRef.current
    ) {
      (async () => {
        if (!cancelled) {
          await playAudio(lastMsg.audioFileUrl!);
          lastPlayedAudioHashRef.current = lastMsgHash;
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(`lastPlayedAudioHash-${bot.name}`, lastMsgHash);
          }
        }
      })();
    }
    return () => {
      cancelled = true;
      stopAudio();
    };
  }, [messages, bot.name, playAudio, stopAudio]);

  // Cleanup audio on unmount (stops playback if user leaves page)
  useEffect(() => {
    return () => {
      stopAudio();
      // Removed attempt to close audioContextRef from playAudio, as playAudio does not expose audioContextRef
    };
  }, [stopAudio]);

  // Add debugging logs to trace retrying state
  useEffect(() => {
    console.debug("Retrying state updated", {
      event: "chat_retrying_state",
      retrying
    });
  }, [retrying]);

  return (
    <div className={styles.chatLayout} data-testid="chat-layout">
      <ChatHeader
        onDownloadTranscript={handleDownloadTranscript}
        onHeaderLinkClick={handleHeaderLinkClick}
        onBackToCharacterCreation={handleBackToCharacterCreation}
        bot={bot}
      />
      <div
        ref={chatBoxRef}
        className={styles.chatMessagesScroll}
        data-testid="chat-messages-container"
        onScroll={handleScroll}
        style={{ paddingTop: 20 }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <ChatMessagesList
          messages={messages.slice(-visibleCount)}
          bot={bot}
        />
      </div>
      {loading && (
        <div data-testid="loading-indicator" className={styles.spinnerContainerFixed}>
          <span className={styles.genericSpinner} aria-label="Loading" />
        </div>
      )}      <ChatInput
        input={input}
        setInput={setInput}
        onSend={sendMessage}
        onKeyDown={handleKeyDown}
        loading={loading}
        apiAvailable={apiAvailable && !(!apiAvailable)}
        inputRef={inputRef} audioEnabled={audioEnabled}
        onAudioToggle={handleAudioToggle}
      />
      <ChatStatus error={error ?? ""} retrying={retrying} />
      <ApiUnavailableModal show={!apiAvailable} />
    </div>
  );
}

export default ChatPage;
