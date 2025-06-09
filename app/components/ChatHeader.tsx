import React, { useContext, useState } from "react";
import { DarkModeContext } from "./DarkModeContext";
import styles from "./styles/ChatHeader.module.css";
import Image from "next/image";
import ModalImageViewer from "./ModalImageViewer";
import HamburgerMenu from "./HamburgerMenu";
import { FaArrowLeft, FaRegFileAlt, FaRegLightbulb, FaMoon, FaSun } from "react-icons/fa";

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

const ChatHeader: React.FC<ChatHeaderProps> = ({ onDownloadTranscript, onShowPrompt, onHeaderLinkClick, onBackToCharacterCreation, bot }) => {
  const [showImageModal, setShowImageModal] = useState(false);
  const { darkMode, setDarkMode } = useContext(DarkModeContext);
  if (!bot) return null;
  return (
    <div className={styles.chatHeader} data-testid="chat-header" role="banner">
      <div className={styles.chatHeaderContent}>
        <div className={styles.headerLeft}>
          <HamburgerMenu>
            {onBackToCharacterCreation && (
              <button
                className={styles.downloadTranscriptLink}
                type="button"
                aria-label="Back to character creation"
                onClick={onBackToCharacterCreation}
                style={{ marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.7em' }}
              >
                <FaArrowLeft size={18} style={{ color: '#bfae7c' }} />
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
              <FaRegFileAlt size={18} style={{ color: '#bfae7c' }} />
              <span className={styles.downloadLabel}>Transcript</span>
            </button>
            <button
              className={styles.downloadTranscriptLink}
              type="button"
              aria-label="Show bot prompt"
              onClick={onShowPrompt}
              style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.7em' }}
            >
              <FaRegLightbulb size={18} style={{ color: '#bfae7c' }} />
              <span>Prompt</span>
            </button>
            <button
              type="button"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setDarkMode(!darkMode)}
              style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.7em' }}
            >
              {darkMode ? (
                <FaSun size={18} style={{ color: '#bfae7c' }} />
              ) : (
                <FaMoon size={18} style={{ color: '#bfae7c' }} />
              )}
              <span style={{ fontSize: '1rem' }}>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </HamburgerMenu>
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
};

export default ChatHeader;
