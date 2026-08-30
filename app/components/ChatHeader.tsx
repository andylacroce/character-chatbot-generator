import React from "react";
import styles from "./styles/ChatHeader.module.css";
import Image from "next/image";
import Link from "next/link";
import HamburgerMenu from "./HamburgerMenu";
import { FaArrowLeft, FaRegFileAlt, FaImages } from "react-icons/fa";
import DarkModeToggle from "./DarkModeToggle";

interface ChatHeaderProps {
  onDownloadTranscript: () => void;
  onHeaderLinkClick?: () => void;
  onBackToCharacterCreation?: () => void;
  // Opens the shared portrait lightbox (owned by ChatPage, since per-message
  // avatars in ChatMessage open the exact same modal — a single instance
  // avoids duplicating ModalImageViewer's state per message).
  onAvatarClick: () => void;
  bot: {
    name: string;
    personality: string;
    avatarUrl: string;
    // True for a character created past an overridden copyright warning — hides the
    // Download Transcript button too, so no artifact of that session leaves the app.
    skipPersistence?: boolean;
  };
}

const ChatHeader: React.FC<ChatHeaderProps> = React.memo(({ onDownloadTranscript, onHeaderLinkClick, onBackToCharacterCreation, onAvatarClick, bot }) => {
  if (!bot) return null;
  return (
    <div className={styles.chatHeader} data-testid="chat-header" role="banner">
      <div className={styles.chatHeaderContent}>
        <div className={styles.headerLeft}>
          {/* Desktop/tablet: inline, Mobile: stacked */}
          <div className={styles.menuAndToggleRow}>
            <HamburgerMenu>
              {onBackToCharacterCreation && (
                <button
                  className={`${styles.downloadTranscriptLink} ${styles.stackedAbove}`}
                  type="button"
                  aria-label="Back to character creation"
                  onClick={onBackToCharacterCreation}
                >
                  <FaArrowLeft size={18} className={styles.linkIcon} />
                  <span>Character Creator</span>
                </button>
              )}
              {!bot.skipPersistence && (
                <button
                  className={styles.downloadTranscriptLink}
                  type="button"
                  aria-label="Download chat transcript"
                  onClick={() => { onDownloadTranscript(); if (onHeaderLinkClick) onHeaderLinkClick(); }}
                >
                  <FaRegFileAlt size={18} className={styles.linkIcon} />
                  <span>Download Transcript</span>
                </button>
              )}
              <Link
                href="/chars"
                className={styles.downloadTranscriptLink}
                aria-label="View the character wall"
              >
                <FaImages size={18} className={styles.linkIcon} />
                <span>Character Wall</span>
              </Link>
            </HamburgerMenu>
            <span className={styles.desktopToggle}>
              <DarkModeToggle className={styles.darkModeToggle} />
            </span>
          </div>
          <span className={styles.mobileToggle}>
            <DarkModeToggle className={styles.darkModeToggle} />
          </span>
        </div>
        <div className={styles.headerCenter}>
          <button
            type="button"
            aria-label="View character portrait"
            className={styles.avatarButton}
            onClick={onAvatarClick}
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
        </div>
        <div className={styles.headerRight}>
          <a
            href="https://www.andrewlacroce.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onHeaderLinkClick}
            aria-label="Visit Andy Lacroce's website"
            className={styles.brandLink}
          >
            <Image src="/andrew.png" alt="Andrew" width={50} height={50} className={styles.brandImage} />
          </a>
        </div>
      </div>
    </div>
  );
});

ChatHeader.displayName = "ChatHeader";

export default ChatHeader;
