// =============================
// CharacterInfoModal.tsx
// Modal explaining which characters are allowed, triggered from a small link
// on the landing page instead of always-visible text (saves vertical space,
// keeps the functional instructions the only thing shown by default).
// =============================

import React from "react";
import styles from "./styles/BotCreator.module.css";
import DisclaimerStyleModal from "./DisclaimerStyleModal";

interface CharacterInfoModalProps {
  show: boolean;
  onClose: () => void;
}

const CharacterInfoModal: React.FC<CharacterInfoModalProps> = ({ show, onClose }) => (
  <DisclaimerStyleModal
    show={show}
    onClose={onClose}
    title="Which characters can I create?"
    closeLabel="Close character info"
    testId="character-info-modal-backdrop"
  >
    <p className={styles.disclaimerText}>
      Create a chatbot character using well-known public domain figures from classic
      literature, mythology, or historical figures. Characters from copyrighted or
      trademarked modern media will trigger a warning.
    </p>
  </DisclaimerStyleModal>
);

export default CharacterInfoModal;
