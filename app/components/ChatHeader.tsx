import React, { useState } from "react";
import styles from "./styles/ChatHeader.module.css";
import Image from "next/image";
import ModalImageViewer from "./ModalImageViewer";

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
  if (!bot) return null;
  return (
    <div className={styles.chatHeader} data-testid="chat-header" role="banner">
      <div className={styles.chatHeaderContent}>
        <div className={styles.headerLeft}>
          <div className="mt-2" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {onBackToCharacterCreation && (
              <button
                className={styles.downloadTranscriptLink}
                type="button"
                aria-label="Back to character creation"
                onClick={onBackToCharacterCreation}
                style={{ marginBottom: '0.2rem' }}
              >
                <span role="img" aria-label="Back">⬅️</span> Character Creator
              </button>
            )}
            <button
              className={`${styles.downloadTranscriptLink} flex items-center gap-1 ml-0`}
              type="button"
              aria-label="Download chat transcript"
              onClick={() => { onDownloadTranscript(); if (onHeaderLinkClick) onHeaderLinkClick(); }}
            >
              <span className={styles.downloadIcon} aria-hidden="true">
                &#128190;
              </span>
              <span className={styles.downloadLabel}>Transcript</span>
            </button>
            <button
              className={styles.downloadTranscriptLink}
              type="button"
              aria-label="Show bot prompt"
              onClick={onShowPrompt}
              style={{marginTop: '0.3rem'}}>
              <span role="img" aria-label="Prompt">💡</span> Prompt
            </button>
          </div>
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
