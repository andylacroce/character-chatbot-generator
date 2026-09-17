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
import { FaArrowLeft, FaRegFileAlt, FaImages, FaUser } from "react-icons/fa";
import Link from "next/link";
import "@trendmicro/react-toggle-switch/dist/react-toggle-switch.css";
import styles from "./styles/ChatPage.module.css";
import ApiUnavailableModal from "./ApiUnavailableModal";
import { NameCaptureModal } from "./NameCaptureModal";
import { useUserName } from "./useUserName";
import type { Bot } from "./BotCreator";
import { useChatController } from "./useChatController";
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
  // The visitor's own preferred name — shown on their own messages (ChatMessage.tsx)
  // instead of "Me", included in a downloaded transcript, and editable here via the
  // header's "Change your name" menu item. A single instance for the whole page, so a
  // change is immediately visible everywhere, not just for new messages going forward.
  const userNameCtx = useUserName();
  const [showEditNameModal, setShowEditNameModal] = React.useState(false);

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
          <FaArrowLeft size={18} className={styles.linkIcon} />
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
          <FaRegFileAlt size={18} className={styles.linkIcon} />
          <span>Download Transcript</span>
        </button>
      )}
      <button
        className={styles.menuItemLink}
        type="button"
        onClick={() => setShowEditNameModal(true)}
      >
        <FaUser size={18} className={styles.linkIcon} />
        <span>{userNameCtx.name ? "Change your name" : "Add your name"}</span>
      </button>
      <Link href="/chars" className={styles.menuItemLink} aria-label="View the character wall">
        <FaImages size={18} className={styles.linkIcon} />
        <span>Character Wall</span>
      </Link>
    </>
  );

  const modals = (
    <>
      <NameCaptureModal
        show={showEditNameModal}
        onClose={() => setShowEditNameModal(false)}
        mode="edit"
        currentName={userNameCtx.name}
        onSave={(name) => {
          userNameCtx.setName(name);
          setShowEditNameModal(false);
        }}
      />
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
      onStopAudio={stopAudio}
      isAudioPlaying={isAudioPlaying}
      error={introError ?? error ?? ""}
      retrying={retrying}
    />
  );
}

export default ChatPage;
