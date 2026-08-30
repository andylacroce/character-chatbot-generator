// =============================
// SignInModal.tsx
// Sign-in lightbox, triggered from AuthControl's "Sign in" button. Replaces
// navigating straight to signIn() — with only one real provider (Google) that
// call redirects off-site immediately with zero in-app context; this gives the
// user a moment on the landing page explaining what signing in does first.
// =============================

import React from "react";
import { signIn } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";
import styles from "./styles/BotCreator.module.css";
import DisclaimerStyleModal from "./DisclaimerStyleModal";

interface SignInModalProps {
  show: boolean;
  onClose: () => void;
}

const SignInModal: React.FC<SignInModalProps> = ({ show, onClose }) => (
  <DisclaimerStyleModal
    show={show}
    onClose={onClose}
    title="Sign in"
    closeLabel="Close sign in"
    testId="sign-in-modal-backdrop"
  >
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
  </DisclaimerStyleModal>
);

export default SignInModal;
