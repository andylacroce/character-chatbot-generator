// =============================
// SignInModal.tsx
// Sign-in lightbox, triggered from AuthControl's "Sign in" button. Replaces
// navigating straight to signIn() — with only one real provider (Google) that
// call redirects off-site immediately with zero in-app context; this gives the
// user a moment on the landing page explaining what signing in does first.
// =============================

import React, { useEffect } from "react";
import { signIn } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";
import styles from "./styles/BotCreator.module.css";

interface SignInModalProps {
  show: boolean;
  onClose: () => void;
}

const SignInModal: React.FC<SignInModalProps> = ({ show, onClose }) => {
  useEffect(() => {
    if (!show) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className={styles.disclaimerBackdrop} data-testid="sign-in-modal-backdrop" onClick={onClose}>
      <div className={styles.disclaimerModal} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.disclaimerCloseButton}
          aria-label="Close sign in"
          onClick={onClose}
        >
          ×
        </button>
        <div className={styles.disclaimerTitle}>Sign in</div>
        <p className={styles.disclaimerText}>
          Save your characters and chat history to your account, so they&apos;re
          there next time you come back.
        </p>
        <button
          type="button"
          className={styles.googleSignInButton}
          onClick={() => signIn("google")}
        >
          <FaGoogle size={18} />
          Continue with Google
        </button>
      </div>
    </div>
  );
};

export default SignInModal;
