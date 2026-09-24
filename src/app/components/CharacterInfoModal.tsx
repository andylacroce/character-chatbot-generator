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

/** Modal explaining which characters are allowed to be created. */
const CharacterInfoModal: React.FC<CharacterInfoModalProps> = ({ show, onClose }) => (
  <DisclaimerStyleModal
    show={show}
    onClose={onClose}
    title="Which characters can I create?"
    closeLabel="Close character info"
    testId="character-info-modal-backdrop"
  >
    <p className={styles.disclaimerText}>
      Real people and characters from history, mythology, or classic literature work best: think
      Cleopatra, Sherlock Holmes, or Zeus. A name from copyrighted or trademarked modern media
      (Disney, Marvel, and the like) will trigger a warning with public-domain alternatives instead.
      Don&apos;t see who you&apos;re looking for? If we don&apos;t recognize the name, you can
      describe the character yourself, including a fully original one.
    </p>
  </DisclaimerStyleModal>
);

export default CharacterInfoModal;
