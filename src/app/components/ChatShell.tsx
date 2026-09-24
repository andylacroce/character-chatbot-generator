"use client";

/**
 * The shared chat screen shell: sticky header (clickable avatar + portrait lightbox,
 * name), scrollable transcript, input bar with audio controls, and status line.
 * Extracted out of ChatPage.tsx so the guessing game (GamePage.tsx) renders the exact
 * same chat UI instead of a lookalike copy — everything page-specific (menu items,
 * modals, banners, what goes on the input) is a prop, everything else (layout, the
 * avatar lightbox, ARIA roles) lives here once. Mirrors why AppHeader itself was
 * extracted (see its own doc comment) — one implementation of the shared chrome
 * instead of two pages each reinventing it.
 */

import React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import ChatMessagesList from "./ChatMessagesList";
import ChatInput from "./ChatInput";
import ChatStatus from "./ChatStatus";
import AppHeader from "./AppHeader";
import type { Bot } from "./BotCreator";
import type { Message } from "../../types/message";
import styles from "./styles/ChatPage.module.css";
import { displayCharacterName } from "character-chatbot-shared";

// Dynamically imported for code splitting, shared by the avatar button here and every
// per-message bot avatar in ChatMessage — one instance/state, not one per message.
const ModalImageViewer = dynamic(() => import("./ModalImageViewer"), { ssr: false });

export interface ChatShellProps {
  /** Display identity for the header and transcript avatars — not necessarily a full saved character (the game passes a minimal stand-in). */
  bot: Bot;
  messages: Message[];
  /** The visitor's own name, shown on their messages instead of "Me" — see ChatMessage.tsx. */
  userName?: string;
  /** Hamburger dropdown content — entirely page-specific. */
  menuItems: React.ReactNode;
  /** Extra content under the header's name label, e.g. the game's streak badge. */
  belowName?: React.ReactNode;
  /** Modals rendered as a sibling of the header (name capture, API-unavailable, how-to-play, etc.). */
  modals?: React.ReactNode;
  /** Banner content rendered above the transcript, e.g. the game's correct/wrong-guess banners. */
  bannerContent?: React.ReactNode;
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onScroll?: () => void;
  loading: boolean;
  apiAvailable: boolean;
  chatBoxRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  audioEnabled: boolean;
  onAudioToggle: () => void;
  onStopAudio: () => void;
  isAudioPlaying: boolean;
  onReplayAudio?: (message: Message) => void;
  error: string;
  retrying?: boolean;
}

/** Shared chat screen shell — see module doc above. */
function ChatShell({
  bot,
  messages,
  userName,
  menuItems,
  belowName,
  modals,
  bannerContent,
  input,
  setInput,
  onSend,
  onKeyDown,
  onScroll,
  loading,
  apiAvailable,
  chatBoxRef,
  inputRef,
  audioEnabled,
  onAudioToggle,
  onStopAudio,
  isAudioPlaying,
  onReplayAudio,
  error,
  retrying,
}: ChatShellProps) {
  const [showImageModal, setShowImageModal] = React.useState(false);
  const handleAvatarClick = React.useCallback(() => setShowImageModal(true), []);

  return (
    <div className={styles.chatLayout} data-testid="chat-layout">
      <AppHeader
        menuItems={menuItems}
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
                priority
                width={150}
                height={150}
                className={styles.avatarImage}
              />
            </button>
            <div className={styles.botNameLabel}>{displayCharacterName(bot.name)}</div>
            {belowName}
          </>
        }
      />
      {modals}
      {bannerContent}
      <div
        ref={chatBoxRef}
        className={styles.chatMessagesScroll}
        data-testid="chat-messages-container"
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className={styles.chatMessagesInner}>
          <ChatMessagesList
            messages={messages}
            bot={bot}
            onAvatarClick={handleAvatarClick}
            onReplayAudio={onReplayAudio}
            replayDisabled={!audioEnabled}
            userName={userName}
          />
        </div>
      </div>
      {loading && (
        <div data-testid="loading-indicator" className={styles.spinnerContainerFixed}>
          <span className={styles.genericSpinner} aria-label="Loading" />
        </div>
      )}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={onSend}
        onKeyDown={onKeyDown}
        loading={loading}
        apiAvailable={apiAvailable}
        inputRef={inputRef}
        audioEnabled={audioEnabled}
        onAudioToggle={onAudioToggle}
        onStopAudio={onStopAudio}
        isAudioPlaying={isAudioPlaying}
      />
      <ChatStatus error={error} retrying={retrying} />
      <ModalImageViewer
        show={showImageModal}
        imageUrl={bot.avatarUrl}
        alt={bot.name}
        onClose={() => setShowImageModal(false)}
      />
    </div>
  );
}

export default ChatShell;
