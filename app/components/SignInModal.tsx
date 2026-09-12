// =============================
// SignInModal.tsx
// Sign-in lightbox, triggered from AuthControl's "Sign in" button. Replaces
// navigating straight to signIn() — with only one real provider (Google) that
// call redirects off-site immediately with zero in-app context; this gives the
// user a moment on the landing page explaining what signing in does first.
// =============================

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";
import styles from "./styles/BotCreator.module.css";
import DisclaimerStyleModal from "./DisclaimerStyleModal";

interface SignInModalProps {
  show: boolean;
  onClose: () => void;
  /** Provider ids currently configured on the server (from next-auth's getProviders()). */
  providerIds: string[] | null;
}

type MagicLinkStatus = "idle" | "sending" | "sent" | "error";

/** Sign-in lightbox triggered from AuthControl's "Sign in" button. */
const SignInModal: React.FC<SignInModalProps> = ({ show, onClose, providerIds }) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<MagicLinkStatus>("idle");

  const hasEmailProvider = providerIds?.includes("email") ?? false;

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    const result = await signIn("email", { email: email.trim(), redirect: false });
    setStatus(result?.error ? "error" : "sent");
  };

  return (
    <DisclaimerStyleModal
      show={show}
      onClose={onClose}
      title="Sign in"
      closeLabel="Close sign in"
      testId="sign-in-modal-backdrop"
    >
      <p className={styles.disclaimerText}>
        Save your characters and chat history to your account, so they&apos;re there next time you
        come back.
      </p>
      <button type="button" className={styles.googleSignInButton} onClick={() => signIn("google")}>
        <FaGoogle size={18} />
        Continue with Google
      </button>
      {hasEmailProvider && (
        <>
          <div className={styles.signInDivider}>or</div>
          {status === "sent" ? (
            <p className={styles.disclaimerText} data-testid="magic-link-sent">
              Check your inbox at {email.trim()} for a sign-in link.
            </p>
          ) : (
            <form className={styles.magicLinkForm} onSubmit={handleMagicLinkSubmit}>
              <input
                type="email"
                inputMode="email"
                required
                placeholder="you@example.com"
                aria-label="Email address"
                className={styles.magicLinkInput}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                type="submit"
                className={styles.magicLinkSubmit}
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending..." : "Send magic link"}
              </button>
            </form>
          )}
          {status === "error" && (
            <p className={styles.magicLinkStatus} data-tone="error">
              Couldn&apos;t send that link. Please try again.
            </p>
          )}
        </>
      )}
    </DisclaimerStyleModal>
  );
};

export default SignInModal;
