"use client";

/**
 * Generic "How to play" lightbox shared by both guessing games — "Guess Who's Next"
 * (shown the first time a visitor reaches /guess-who-next, gated by
 * STORAGE_KEYS.guessWhoNextInstructionsSeen) and "Guess Who" (its own gated key),
 * reopenable anytime from either game's menu. Reuses DisclaimerStyleModal and
 * BotCreator.module.css's disclaimer* classes, the same shared small-lightbox shell
 * NameCaptureModal uses, rather than a bespoke modal + CSS module per game.
 *
 * Each caller supplies its own `copy` (a game's `copy.instructions`, from
 * character-chatbot-shared) — kept short and scannable by design (one-line premise, a handful of short bullets, one goal line)
 * rather than a dense paragraph, so it reads well in this modal's compact width.
 */

import React from "react";
import styles from "./styles/BotCreator.module.css";
import DisclaimerStyleModal from "./DisclaimerStyleModal";

/** The short, scannable instructions shape both games' copy constants share. */
export interface GameInstructionsCopy {
  title: string;
  premise: string;
  bullets: readonly string[];
  goal: string;
  closeLabel: string;
}

interface GameInstructionsModalProps {
  show: boolean;
  onClose: () => void;
  copy: GameInstructionsCopy;
  testId?: string;
}

/** "How to play" lightbox explaining a guessing game's rules, generic over which game. */
const GameInstructionsModal: React.FC<GameInstructionsModalProps> = ({
  show,
  onClose,
  copy,
  testId = "game-instructions-modal-backdrop",
}) => {
  return (
    <DisclaimerStyleModal
      show={show}
      onClose={onClose}
      title={copy.title}
      closeLabel="Close"
      testId={testId}
    >
      <p className={styles.disclaimerText}>{copy.premise}</p>
      <ul className={`${styles.disclaimerText} ${styles.disclaimerList}`}>
        {copy.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <p className={styles.disclaimerText}>{copy.goal}</p>
      <div className={styles.nameCaptureActions}>
        <button type="button" className={styles.nameCaptureSaveButton} onClick={onClose}>
          {copy.closeLabel}
        </button>
      </div>
    </DisclaimerStyleModal>
  );
};

export default GameInstructionsModal;
