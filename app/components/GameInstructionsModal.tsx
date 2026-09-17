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
        You&apos;re chatting with a real, named character, no mystery there. But as the conversation
        goes on, they&apos;ll start steering it toward someone else entirely: a different person
        they have in mind, dropping hints without ever saying the name.
      </p>
      <p className={styles.disclaimerText}>
        Ask questions to pull out more clues. When you think you know who they mean, type your guess
        right into the same chat box, there&apos;s no separate guess button, just keep talking. You
        don&apos;t need the exact full name; a nickname or good description works too. If it&apos;s
        unclear whether you&apos;re asking a question or guessing, they&apos;ll check with you
        before deciding.
      </p>
      <p className={styles.disclaimerText}>
        Guess right and that person becomes your new chat partner, hinting at someone else in turn,
        so keep the streak going as long as you can. You get one wrong guess per person: a second
        wrong guess ends the run and reveals the answer. You can also give up anytime to see who it
        was.
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
