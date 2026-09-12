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
import dynamic from "next/dynamic";
import { FaArrowLeft, FaRegFileAlt, FaImages, FaUser } from "react-icons/fa";
import Image from "next/image";
import Link from "next/link";
import ChatMessagesList from "./ChatMessagesList";
import "@trendmicro/react-toggle-switch/dist/react-toggle-switch.css";
import styles from "./styles/ChatPage.module.css";
import ChatInput from "./ChatInput";
import ChatStatus from "./ChatStatus";
import ApiUnavailableModal from "./ApiUnavailableModal";
import AppHeader from "./AppHeader";
import { NameCaptureModal } from "./NameCaptureModal";
import { useUserName } from "./useUserName";
import type { Bot } from "./BotCreator";
import { useChatController } from "./useChatController";

// Dynamically import ModalImageViewer for code splitting. Owned here (not in
// AppHeader) since both the header's avatar and every per-message bot avatar
// in ChatMessage open this same lightbox — one shared instance/state instead
// of duplicating it per message.
const ModalImageViewer = dynamic(() => import("./ModalImageViewer"), { ssr: false });

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
  const [showImageModal, setShowImageModal] = React.useState(false);
  const handleAvatarClick = React.useCallback(() => setShowImageModal(true), []);

  return (
    <div className={styles.chatLayout} data-testid="chat-layout">
      <AppHeader
        menuSide="left"
        menuItems={
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
            <Link
              href="/chars"
              className={styles.menuItemLink}
              aria-label="View the character wall"
            >
              <FaImages size={18} className={styles.linkIcon} />
              <span>Character Wall</span>
            </Link>
          </>
        }
        center={
          <>
            <button
              type="button"
              aria-label="View character portrait"
              className={styles.avatarButton}
              onClick={handleAvatarClick}
            >
              <Image
                src={bot.avatarUrl}
                alt={bot.name}
                priority={true}
                width={150}
                height={150}
                className={styles.avatarImage}
              />
            </button>
            <div className={styles.botNameLabel}>{bot.name}</div>
          </>
        }
        extra={
          <a
            href="https://www.andrewlacroce.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleHeaderLinkClick}
            aria-label="Visit Andy Lacroce's website"
            className={styles.brandLink}
          >
            <Image
              src="/andrew.png"
              alt="Andrew"
              width={50}
              height={50}
              className={styles.brandImage}
            />
          </a>
        }
      />
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
      <div
        ref={chatBoxRef}
        className={styles.chatMessagesScroll}
        data-testid="chat-messages-container"
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className={styles.chatMessagesInner}>
          <ChatMessagesList
            messages={messages.slice(-visibleCount)}
            bot={bot}
            onAvatarClick={handleAvatarClick}
            userName={userNameCtx.name}
          />
        </div>
      </div>
      {(loading || introLoading) && (
        <div data-testid="loading-indicator" className={styles.spinnerContainerFixed}>
          <span className={styles.genericSpinner} aria-label="Loading" />
        </div>
      )}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={sendMessage}
        onKeyDown={handleKeyDown}
        loading={loading || introLoading}
        apiAvailable={apiAvailable}
        inputRef={inputRef}
        audioEnabled={audioEnabled}
        onAudioToggle={handleAudioToggle}
        onStopAudio={stopAudio}
        isAudioPlaying={isAudioPlaying}
      />
      {/* Prefer introError if present, else error */}
      <ChatStatus error={introError ?? error ?? ""} retrying={retrying} />
      <ApiUnavailableModal show={!apiAvailable} />
      <ModalImageViewer
        show={showImageModal}
        imageUrl={bot.avatarUrl}
        alt={bot.name}
        onClose={() => setShowImageModal(false)}
      />
    </div>
  );
}

export default ChatPage;
