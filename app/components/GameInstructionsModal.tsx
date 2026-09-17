"use client";

/**
 * "How to play" lightbox for the guessing game — shown automatically the first time a
 * visitor reaches /game (gated by STORAGE_KEYS.gameInstructionsSeen so it never repeats
 * uninvited in that browser), and reopenable anytime from GamePage's menu. Reuses
 * DisclaimerStyleModal and BotCreator.module.css's disclaimer* classes, the same shared
 * small-lightbox shell NameCaptureModal uses, rather than a bespoke modal + CSS module.
 *
 * Copy here must accurately describe the actual mechanic: the player's chat partner is
 * always a real, named character, not a mystery — what's hidden is a *different* figure
 * that partner steers the conversation toward. Getting this backwards in the UI (as an
 * earlier draft of this feature did internally) would make the game genuinely
 * unplayable, since the player would be guessing the wrong target entirely.
 */

import React from "react";
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
      title="How to play"
      closeLabel="Close"
      testId="game-instructions-modal-backdrop"
    >
      <p className={styles.disclaimerText}>
        You&apos;ll chat with a real, named historical or mythological figure. There&apos;s no
        secret about who <em>they</em> are, but as you talk, they&apos;ll start steering the
        conversation toward someone else entirely, dropping hints about that other person without
        ever naming them.
      </p>
      <p className={styles.disclaimerText}>
        Ask them anything to draw out more clues, then type your guess for who they&apos;re
        describing right into the same chat box. There&apos;s no separate guess control, just keep
        talking. Guesses don&apos;t have to be exact: a nickname or a good description works too,
        and if it&apos;s not clear whether you meant a question or a guess, they&apos;ll ask you to
        confirm.
      </p>
      <p className={styles.disclaimerText}>
        Guess right and that person joins the chat next, continuing the chain and building your
        streak. You get one wrong guess per person before a run ends, or give up anytime to see the
        answer.
      </p>
      <div className={styles.nameCaptureActions}>
        <button type="button" className={styles.nameCaptureSaveButton} onClick={onClose}>
          Got it, let&apos;s play
        </button>
      </div>
    </DisclaimerStyleModal>
  );
};

export default GameInstructionsModal;
