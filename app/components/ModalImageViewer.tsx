// =============================
// ModalImageViewer.tsx
// Modal component for displaying an enlarged image (e.g., character avatar).
// Props: show (boolean), imageUrl (string), alt (string), onClose (function).
// Used in ChatHeader and BotCreator for image previews.
// =============================

import React from "react";
import Image from "next/image";
import styles from "./styles/ChatPage.module.css";

interface ModalImageViewerProps {
  show: boolean;
  imageUrl: string;
  alt: string;
  onClose: () => void;
}

const ModalImageViewer: React.FC<ModalImageViewerProps> = ({ show, imageUrl, alt, onClose }) => {
  if (!show) return null;
  return (
    <div className={styles.modalBackdrop} data-testid="modal-image-backdrop" onClick={onClose}>
      <div
        className={styles.modalError}
        style={{ maxWidth: 480, width: '90vw', padding: 0, position: 'relative', background: 'var(--color-background)', color: 'var(--color-text)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          className={styles.closeButton}
          aria-label="Close image viewer"
          onClick={onClose}
          style={{ position: 'absolute', top: 10, right: 14 }}
        >
          ×
        </button>
        <Image
          src={imageUrl}
          alt={alt}
          width={800}
          height={600}
          style={{
            maxWidth: '90vw',
            maxHeight: '70vh',
            width: 'calc(100% - 3rem)',
            height: 'auto',
            display: 'block',
            borderRadius: 12,
            margin: '2.5rem auto 2.5rem auto',
            background: 'var(--card-body-bg)',
            objectFit: 'contain',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
};

export default ModalImageViewer;
