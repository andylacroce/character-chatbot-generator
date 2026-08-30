// =============================
// ModalImageViewer.tsx
// Modal component for displaying an enlarged image (e.g., character avatar).
// Props: show (boolean), imageUrl (string), alt (string), onClose (function).
// Used in ChatHeader and BotCreator for image previews.
// =============================

import React from "react";
import Image from "next/image";
import styles from "./styles/ChatPage.module.css";
import viewerStyles from "./styles/ModalImageViewer.module.css";

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
        className={`${styles.modalError} ${viewerStyles.modal}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          className={`${styles.closeButton} ${viewerStyles.closeButton}`}
          aria-label="Close image viewer"
          onClick={onClose}
        >
          ×
        </button>
        <Image
          src={imageUrl}
          alt={alt}
          width={800}
          height={600}
          className={viewerStyles.image}
        />
      </div>
    </div>
  );
};

export default ModalImageViewer;
