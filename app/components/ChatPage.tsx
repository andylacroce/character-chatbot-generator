/**
 * Main chat interface component that manages the conversation with the Character Chatbot Generator.
 *
 * Handles chat state, message sending, transcript download, and audio playback.
 * Integrates with OpenAI and Google TTS via API routes.
 *
 * @module ChatPage
 */

"use client";

import React from "react";
import "../globals.css";
import ChatMessagesList from "./ChatMessagesList";
import "@trendmicro/react-toggle-switch/dist/react-toggle-switch.css";
import styles from "./styles/ChatPage.module.css";
import ChatInput from "./ChatInput";
import ChatStatus from "./ChatStatus";
import ApiUnavailableModal from "./ApiUnavailableModal";
import ChatHeader from "./ChatHeader";
import type { Bot } from "./BotCreator";
import { useChatController } from "./useChatController";

/**
 * ChatPage component that handles the chat interface and interactions with the Character Chatbot Generator.
 * This component manages the state of the conversation, handles user input, and plays audio responses.
 *
 * @returns {JSX.Element} The ChatPage component.
 */
function ChatPage({ bot, onBackToCharacterCreation }: { bot: Bot, onBackToCharacterCreation?: () => void }) {
  const {
    messages,
    input,
    setInput,
    loading,
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
    stopAudio,
    isAudioPlaying,
  } = useChatController(bot, onBackToCharacterCreation);


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
      )}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={sendMessage}
        onKeyDown={handleKeyDown}
        loading={loading}
        apiAvailable={apiAvailable && !(!apiAvailable)}
        inputRef={inputRef}
        audioEnabled={audioEnabled}
        onAudioToggle={handleAudioToggle}
        onStopAudio={stopAudio}
        isAudioPlaying={isAudioPlaying}
      />
      {/* Prefer introError if present, else error */}
      <ChatStatus error={introError ?? error ?? ""} retrying={retrying} />
      <ApiUnavailableModal show={!apiAvailable} />
    </div>
  );
}

export default ChatPage;
