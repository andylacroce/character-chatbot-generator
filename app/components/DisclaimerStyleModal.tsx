// =============================
// DisclaimerStyleModal.tsx
// Shared backdrop/box/close-button/title shell for the small lightboxes that
// use BotCreator.module.css's "disclaimer*" classes (SignInModal,
// DisclaimerModal, CharacterInfoModal) — same markup and Escape-key handling
// (via useEscapeToClose) for all three, so a behavior fix (or visual tweak)
// only needs to land in one place.
// =============================

import React from "react";
import styles from "./styles/BotCreator.module.css";
import { useEscapeToClose } from "./useEscapeToClose";

interface DisclaimerStyleModalProps {
  show: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  testId: string;
  children: React.ReactNode;
}

const DisclaimerStyleModal: React.FC<DisclaimerStyleModalProps> = ({
  show,
  onClose,
  title,
  closeLabel,
  testId,
  children,
}) => {
  useEscapeToClose(show, onClose);

  if (!show) return null;

  return (
    <div className={styles.disclaimerBackdrop} data-testid={testId} onClick={onClose}>
      <div className={styles.disclaimerModal} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.disclaimerCloseButton}
          aria-label={closeLabel}
          onClick={onClose}
        >
          ×
        </button>
        <div className={styles.disclaimerTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
};

export default DisclaimerStyleModal;
