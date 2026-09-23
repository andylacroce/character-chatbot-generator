"use client";

/**
 * "How to play" lightbox for the guessing game — shown automatically the first time a
 * visitor reaches /game (gated by STORAGE_KEYS.gameInstructionsSeen so it never repeats
 * uninvited in that browser), and reopenable anytime from GamePage's menu. Reuses
 * DisclaimerStyleModal and BotCreator.module.css's disclaimer* classes, the same shared
 * small-lightbox shell NameCaptureModal uses, rather than a bespoke modal + CSS module.
 * The copy itself lives in character-chatbot-shared's GAME_INSTRUCTIONS, shared with mobile.
 *
 * Copy here must accurately describe the actual mechanic: the player's chat partner is
 * always a real, named character, not a mystery — what's hidden is a *different* figure
 * that partner steers the conversation toward. Getting this backwards in the UI (as an
 * earlier draft of this feature did internally) would make the game genuinely
 * unplayable, since the player would be guessing the wrong target entirely.
 */

import React from "react";
import { GAME_INSTRUCTIONS } from "character-chatbot-shared";
import styles from "./styles/BotCreator.module.css";
import DisclaimerStyleModal from "./DisclaimerStyleModal";

interface GameInstructionsModalProps {
  show: boolean;
  onClose: () => void;
}

/** "How to play" lightbox explaining the guessing game's rules. */
const GameInstructionsModal: React.FC<GameInstructionsModalProps> = ({ show, onClose }) => {
  return (
    <DisclaimerStyleModal
      show={show}
      onClose={onClose}
      title={GAME_INSTRUCTIONS.title}
      closeLabel="Close"
      testId="game-instructions-modal-backdrop"
    >
      {GAME_INSTRUCTIONS.paragraphs.map((paragraph) => (
        <p key={paragraph} className={styles.disclaimerText}>
          {paragraph}
        </p>
      ))}
      <div className={styles.nameCaptureActions}>
        <button type="button" className={styles.nameCaptureSaveButton} onClick={onClose}>
          {GAME_INSTRUCTIONS.closeLabel}
        </button>
      </div>
    </DisclaimerStyleModal>
  );
};

export default GameInstructionsModal;
