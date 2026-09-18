/**
 * Main chat interface component that manages the conversation with the Portrayal character.
 *
 * Handles chat state, message sending, transcript download, and audio playback.
 * Integrates with Claude and Google TTS via API routes.
 *
 * @module ChatPage
 */

"use client";

import React from "react";
import "../globals.css";
import { FaArrowLeft, FaRegFileAlt, FaImages } from "react-icons/fa";
import Link from "next/link";
import "@trendmicro/react-toggle-switch/dist/react-toggle-switch.css";
import styles from "./styles/ChatPage.module.css";
import ApiUnavailableModal from "./ApiUnavailableModal";
import type { Bot } from "./BotCreator";
import { useChatController } from "./useChatController";
import { useAccountMenu } from "./useAccountMenu";
import ChatShell from "./ChatShell";

/**
 * ChatPage component that handles the chat interface and interactions with the Portrayal character.
 * This component manages the state of the conversation, handles user input, and plays audio responses.
 *
 * @returns {JSX.Element} The ChatPage component.
 */
function ChatPage({
  bot,
  onBackToCharacterCreation,
}: {
  bot: Bot;
  onBackToCharacterCreation?: () => void;
}) {
  // The visitor's own name/account menu (identity label, change-name + sign-in/out and
  // admin items, and their modals) — shared with BotCreator.tsx and CharsGallery.tsx.
  // userNameCtx.name is also what's shown on the visitor's own messages (ChatMessage.tsx)
  // instead of "Me" and included in a downloaded transcript.
  const { userNameCtx, menuItems: accountMenuItems, modals: accountModals } = useAccountMenu();

  const {
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
  } = useChatController(bot, onBackToCharacterCreation, userNameCtx.name);

  const menuItems = (
    <>
      {onBackToCharacterCreation && (
        <button
          className={`${styles.menuItemLink} ${styles.stackedAbove}`}
          type="button"
          aria-label="Back to character creation"
          onClick={handleBackToCharacterCreation}
        >
          <FaArrowLeft size={18} className="menuIcon" />
          <span>Character Creator</span>
        </button>
      )}
      {!bot.skipPersistence && (
        <button
          className={styles.menuItemLink}
          type="button"
          aria-label="Download chat transcript"
          onClick={() => {
            handleDownloadTranscript();
            handleHeaderLinkClick();
          }}
        >
          <FaRegFileAlt size={18} className="menuIcon" />
          <span>Download Transcript</span>
        </button>
      )}
      <Link href="/chars" className={styles.menuItemLink} aria-label="View the character wall">
        <FaImages size={18} className="menuIcon" />
        <span>Character Wall</span>
      </Link>
      <div className="menuDivider" role="separator" />
      {accountMenuItems}
    </>
  );

  const modals = (
    <>
      {accountModals}
      <ApiUnavailableModal show={!apiAvailable} />
    </>
  );

  return (
    <ChatShell
      bot={bot}
      messages={messages.slice(-visibleCount)}
      userName={userNameCtx.name}
      menuItems={menuItems}
      modals={modals}
      input={input}
      setInput={setInput}
      onSend={sendMessage}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
      loading={loading || introLoading}
      apiAvailable={apiAvailable}
      chatBoxRef={chatBoxRef}
      inputRef={inputRef}
      audioEnabled={audioEnabled}
      onAudioToggle={handleAudioToggle}
      onReplayAudio={replayMessageAudio}
      onStopAudio={stopAudio}
      isAudioPlaying={isAudioPlaying}
      error={introError ?? error ?? ""}
      retrying={retrying}
    />
  );
}

export default ChatPage;
