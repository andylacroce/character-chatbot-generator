"use client";

/**
 * Lightbox for capturing or changing the visitor's own preferred name — what a
 * character should call them. Used three ways: as a one-time gate right after
 * submitting character creation when no name is known yet (`mode="gate"`), and as an
 * anytime "change your name" action from the landing page and chat-page hamburger menus
 * (`mode="edit"`). A text link hands off to sign-in when `onRequestSignIn` is provided
 * and the visitor isn't signed in — mirrors the approved "Option B" mockup exactly.
 *
 * Deliberately does not render its own SignInModal: the caller owns one shared
 * SignInModal instance (see BotCreator.tsx) so every "sign in" entry point — this
 * modal's link, and AuthControl's own button — opens the exact same modal instead of
 * each instantiating its own, and so that modal never ends up nested inside whatever
 * DOM subtree (e.g. a hamburger dropdown) triggered it.
 */

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./styles/BotCreator.module.css";
import DisclaimerStyleModal from "./DisclaimerStyleModal";

interface NameCaptureModalProps {
  show: boolean;
  onClose: () => void;
  mode: "gate" | "edit";
  currentName: string;
  onSave: (name: string) => void;
  onSkip?: () => void;
  /**
   * Offers a "sign in instead" link when set and the visitor isn't signed in — omitted
   * entirely in the chat header (no sign-in control there, by design).
   */
  onRequestSignIn?: () => void;
}

const MAX_LENGTH = 50;

/** Lightbox for capturing/changing the visitor's own preferred name, with an optional hand-off to sign-in. */
export const NameCaptureModal: React.FC<NameCaptureModalProps> = ({
  show,
  onClose,
  mode,
  currentName,
  onSave,
  onSkip,
  onRequestSignIn,
}) => {
  const { status: sessionStatus } = useSession();
  const [value, setValue] = useState(currentName);

  // Resets local state exactly when the modal transitions to open, so a stale value
  // from a previous open never lingers — a plain state update during render (React's
  // own "resetting state when a prop changes" pattern) instead of an effect, since this
  // component itself stays mounted across shows/hides (only DisclaimerStyleModal's
  // return value toggles).
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) setValue(currentName);
  }

  const canOfferSignIn = Boolean(onRequestSignIn) && sessionStatus !== "authenticated";

  const handleSave = () => {
    onSave(value.trim());
  };

  const handleSkip = () => {
    if (onSkip) onSkip();
    else onClose();
  };

  const handleSignInInstead = () => {
    onClose();
    onRequestSignIn?.();
  };

  return (
    <DisclaimerStyleModal
      show={show}
      onClose={onClose}
      title={mode === "gate" ? "Before we begin" : "Change your name"}
      closeLabel="Close"
      testId="name-capture-modal-backdrop"
    >
      <p className={styles.disclaimerText}>
        {mode === "gate"
          ? "So the character knows how to greet you. Totally optional."
          : "Update the name characters greet you by."}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Andy"
        aria-label="Your name"
        className={styles.nameCaptureInput}
        maxLength={MAX_LENGTH}
        autoFocus
      />
      <div className={styles.nameCaptureActions}>
        <button type="button" className={styles.nameCaptureSaveButton} onClick={handleSave}>
          {mode === "gate" ? "Continue" : "Save"}
        </button>
        {mode === "gate" && (
          <button type="button" className={styles.nameCaptureSkipLink} onClick={handleSkip}>
            Skip for now
          </button>
        )}
      </div>
      {canOfferSignIn && (
        <p className={styles.nameCaptureSwitchLink}>
          Already have an account?{" "}
          <button type="button" onClick={handleSignInInstead}>
            Sign in instead
          </button>
        </p>
      )}
    </DisclaimerStyleModal>
  );
};

export default NameCaptureModal;
