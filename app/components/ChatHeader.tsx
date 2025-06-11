import React, { useContext, useState } from "react";
import { DarkModeContext } from "./DarkModeContext";
import styles from "./styles/ChatHeader.module.css";
import Image from "next/image";
import dynamic from "next/dynamic";
import HamburgerMenu from "./HamburgerMenu";
import { FaArrowLeft, FaRegFileAlt } from "react-icons/fa";
import DarkModeToggle from "./DarkModeToggle";

// Dynamically import ModalImageViewer for code splitting
const ModalImageViewer = dynamic(() => import("./ModalImageViewer"), { ssr: false });

interface ChatHeaderProps {
  onDownloadTranscript: () => void;
  onShowPrompt: () => void;
  onHeaderLinkClick?: () => void;
  onBackToCharacterCreation?: () => void;
  bot: {
    name: string;
    personality: string;
    avatarUrl: string;
  };
}

const ChatHeader: React.FC<ChatHeaderProps> = React.memo(({ onDownloadTranscript, onShowPrompt, onHeaderLinkClick, onBackToCharacterCreation, bot }) => {
  const [showImageModal, setShowImageModal] = useState(false);
  const { darkMode, setDarkMode } = useContext(DarkModeContext);
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
                  className={styles.downloadTranscriptLink}
                  type="button"
                  aria-label="Back to character creation"
                  onClick={onBackToCharacterCreation}
                  style={{ marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.7em' }}
                >
                  <FaArrowLeft size={18} style={{ color: 'var(--color-primary)' }} />
                  <span>Character Creator</span>
                </button>
              )}
              <button
                className={`${styles.downloadTranscriptLink} flex items-center gap-1 ml-0`}
                type="button"
                aria-label="Download chat transcript"
                onClick={() => { onDownloadTranscript(); if (onHeaderLinkClick) onHeaderLinkClick(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}
              >
                <FaRegFileAlt size={18} style={{ color: 'var(--color-primary)' }} />
                <span className={styles.downloadLabel}>Transcript</span>
              </button>
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
            style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer' }}
            onClick={() => setShowImageModal(true)}
          >
            <Image
              src={bot.avatarUrl}
              alt={bot.name}
              priority={true}
              width={150}
              height={150}
              className="rounded-circle"
              style={{ objectFit: 'cover' }}
            />
          </button>
          <div className={styles.botNameLabel}>{bot.name}</div>
        </div>
        <div className={styles.headerRight}>
          <a
            href="https://mastodon.world/@AndyLacroce"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onHeaderLinkClick}
            aria-label="Visit Andy Lacroce on Mastodon"
          >
            <Image src="/mastodon.png" alt="Mastodon" width={50} height={50} />
          </a>
          <a
            href="https://www.andylacroce.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onHeaderLinkClick}
            aria-label="Visit Andy Lacroce's website"
          >
            <Image src="/dexter.webp" alt="Dexter" width={50} height={50} />
          </a>
        </div>
      </div>
      <ModalImageViewer
        show={showImageModal}
        imageUrl={bot.avatarUrl}
        alt={bot.name}
        onClose={() => setShowImageModal(false)}
      />
    </div>
  );
});

ChatHeader.displayName = "ChatHeader";

export default ChatHeader;
