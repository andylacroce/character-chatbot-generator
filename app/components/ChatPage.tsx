/**
 * Main chat interface component that manages the conversation with the Character Chatbot Generator.
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
import Image from "next/image";
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
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import { useApiError } from "./useApiError";
import dynamic from "next/dynamic";
import { Bot } from "./BotCreator";

// Dynamically import BotCreator for code splitting
const BotCreator = dynamic(() => import("./BotCreator"), { ssr: false });

// Constants for infinite scroll functionality
const INITIAL_VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 10;

/**
 * ChatPage component that handles the chat interface and interactions with the Character Chatbot Generator.
 * This component manages the state of the conversation, handles user input, and plays audio responses.
 *
 * @returns {JSX.Element} The ChatPage component.
 */
const ChatPage = ({ bot, onBackToCharacterCreation }: { bot: Bot, onBackToCharacterCreation?: () => void }) => {
  // Use a unique key for each bot's chat history
  const chatHistoryKey = bot ? `chatbot-history-${bot.name}` : null;
  // State definitions
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined' && chatHistoryKey) {
      try {
        const saved = localStorage.getItem(chatHistoryKey);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  // Initialize audioEnabled from localStorage or default to true
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
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
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  const { playAudio, audioRef } = useAudioPlayer(audioEnabledRef);

  const chatBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useChatScrollAndFocus({
    chatBoxRef,
    inputRef,
    messages,
    loading
  });

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
        console.warn("Failed to log message:", error); // Log warning, don't block user
      }
    },
    [sessionId, sessionDatetime],
  ); // Add sessionId and sessionDatetime dependencies

  // Helper for retry with exponential backoff
  async function retryWithBackoff(fn: () => Promise<any>, maxRetries = 2, initialDelay = 800) {
    let attempt = 0;
    let delay = initialDelay;
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxRetries) throw err;
        setRetrying(true);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
        attempt++;
      }
    }
  }

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !apiAvailable || loading) return;
    const userMessage: Message = { sender: "User", text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const currentInput = input;
    setInput("");
    setLoading(true);
    setError("");
    setRetrying(false);

    logMessage(userMessage);

    try {
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
      if (audioEnabledRef.current && botReply.audioFileUrl) {
        await playAudio(botReply.audioFileUrl);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, [input, playAudio, apiAvailable, logMessage, loading, handleApiError, setError, bot]); // input added back to dependencies per lint rule

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
        // Only pause/reset audio, do not delete files
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      }
      return newEnabled;
    });
    // Focus the input after toggling audio
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [audioRef, inputRef]);

  // Persist audioEnabled to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
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
    if (typeof window !== 'undefined' && chatHistoryKey) {
      try {
        localStorage.setItem(chatHistoryKey, JSON.stringify(messages));
      } catch (e) {}
    }
  }, [messages, chatHistoryKey]);

  // Download transcript handler - USE THE UTILITY
  const handleDownloadTranscript = async () => {
    try {
      await downloadTranscript(messages);
    } catch (err) {
      console.error("Failed to download transcript:", err);
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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof onBackToCharacterCreation === 'function') {
      onBackToCharacterCreation();
    }  }, [audioRef, onBackToCharacterCreation]);
  
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);  // Handler to load more messages when scrolled to top
  const handleScroll = useCallback(() => {
    if (!chatBoxRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    
    // Load more messages when scrolled to top and there are more messages available
    if (scrollTop === 0 && visibleCount < messages.length) {
      setVisibleCount((prev) => Math.min(prev + LOAD_MORE_COUNT, messages.length));
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
    setVisibleCount(INITIAL_VISIBLE_COUNT);  }, [chatHistoryKey]);

  return (
    <div className={styles.chatLayout} data-testid="chat-layout">
      <ChatHeader
        onDownloadTranscript={handleDownloadTranscript}
        onShowPrompt={() => setShowPromptModal(true)}
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
          showSkeletons={loading}
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
        inputRef={inputRef}        audioEnabled={audioEnabled}
        onAudioToggle={handleAudioToggle}
      />
      <ChatStatus error={error} retrying={retrying} />
      <ApiUnavailableModal show={!apiAvailable} />
      {/* Prompt Modal */}
      {showPromptModal && (
        <div className={styles.modalBackdrop}>
          <div
            className={styles.promptModal}
            style={{
              maxWidth: '98vw',
              width: '100%',
              padding: '1.2rem 0.5rem 1.2rem 0.5rem',
              boxSizing: 'border-box',
              overflowY: 'auto',
              ...(typeof window !== 'undefined' && window.innerWidth <= 400
                ? { padding: '0.7rem 0.1rem 0.7rem 0.1rem', borderRadius: 7, fontSize: '0.95rem' }
                : {})
            }}
          >
            <button
              className={styles.closeButton}
              onClick={() => setShowPromptModal(false)}
              aria-label="Close"
              style={{
                fontSize: window.innerWidth <= 400 ? '1.5rem' : window.innerWidth <= 600 ? '2.1rem' : '1.7rem',
                top: window.innerWidth <= 400 ? 2 : window.innerWidth <= 600 ? 6 : 10,
                right: window.innerWidth <= 400 ? 4 : window.innerWidth <= 600 ? 10 : 14,
                padding: window.innerWidth <= 600 ? '0.1em 0.3em' : undefined
              }}
            >
              ×
            </button>
            <div className={styles.promptContent} style={{ fontSize: window.innerWidth <= 600 ? '0.98rem' : undefined, padding: window.innerWidth <= 600 ? '0.2rem 0.1rem' : undefined }}>
              <strong>Prompt:</strong>
              <div style={{ marginTop: 8 }}>
                {bot?.personality || 'No prompt available.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
