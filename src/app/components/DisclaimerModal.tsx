// =============================
// DisclaimerModal.tsx
// Modal showing the full disclaimer text, triggered from a small link on the
// landing page instead of always-visible text (saves vertical space on mobile).
// =============================

import React from "react";
import { BRAND } from "character-chatbot-shared";
import styles from "./styles/BotCreator.module.css";
import DisclaimerStyleModal from "./DisclaimerStyleModal";

interface DisclaimerModalProps {
  show: boolean;
  onClose: () => void;
}

/** Modal showing the full legal disclaimer text. */
const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ show, onClose }) => (
  <DisclaimerStyleModal
    show={show}
    onClose={onClose}
    title="Disclaimer"
    closeLabel="Close disclaimer"
    testId="disclaimer-modal-backdrop"
  >
    <p className={styles.disclaimerText}>{BRAND.disclaimer}</p>
  </DisclaimerStyleModal>
);

export default DisclaimerModal;
