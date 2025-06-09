import React from "react";
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
        className={styles.promptModal}
        style={{ maxWidth: 480, width: '90vw', padding: 0, background: '#fff', position: 'relative' }}
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
        <img
          src={imageUrl}
          alt={alt}
          style={{
            maxWidth: '90vw',
            maxHeight: '70vh',
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: 12,
            margin: '2.5rem auto 1.5rem auto',
            background: '#eee',
            objectFit: 'contain',
          }}
        />
      </div>
    </div>
  );
};

export default ModalImageViewer;
