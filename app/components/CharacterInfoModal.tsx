// =============================
// CharacterInfoModal.tsx
// Modal explaining which characters are allowed, triggered from a small link
// on the landing page instead of always-visible text (saves vertical space,
// keeps the functional instructions the only thing shown by default).
// =============================

import React from "react";
import styles from "./styles/BotCreator.module.css";

interface CharacterInfoModalProps {
  show: boolean;
  onClose: () => void;
}

const CharacterInfoModal: React.FC<CharacterInfoModalProps> = ({ show, onClose }) => {
  if (!show) return null;
  return (
    <div className={styles.disclaimerBackdrop} data-testid="character-info-modal-backdrop" onClick={onClose}>
      <div className={styles.disclaimerModal} onClick={e => e.stopPropagation()}>
        <button
          className={styles.disclaimerCloseButton}
          aria-label="Close character info"
          onClick={onClose}
        >
          ×
        </button>
        <div className={styles.disclaimerTitle}>Which characters can I create?</div>
        <p className={styles.disclaimerText}>
          Create a chatbot character using well-known public domain figures from classic
          literature, mythology, or historical figures. Characters from copyrighted or
          trademarked modern media will trigger a warning.
        </p>
      </div>
    </div>
  );
};

export default CharacterInfoModal;
