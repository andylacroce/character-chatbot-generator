// =============================
// AuthControl.tsx
// Sign in / sign out control. Renders nothing while the session is loading,
// to avoid a flash between signed-out and signed-in states.
//
// Clicking "Sign in" opens SignInModal — an in-page lightbox — rather than
// jumping straight off-site to Google's consent screen or (with more than one
// real provider) NextAuth's own bare picker page. On preview (just the stub —
// see authOptions.ts's prod/preview swap), that step is skipped entirely and
// it signs in immediately as a fixed test identity with no prompt, since it's
// a smoke-test aid, not a real login.
// =============================

import React, { useEffect, useState } from "react";
import { useSession, signIn, signOut, getProviders } from "next-auth/react";
import { FaSignInAlt, FaSignOutAlt } from "react-icons/fa";
import SignInModal from "./SignInModal";
import styles from "./styles/AuthControl.module.css";

interface AuthControlProps {
  className?: string;
}

const PREVIEW_STUB_PROVIDER_ID = "preview-stub";
const PREVIEW_STUB_TEST_EMAIL = "preview-test@example.com";

const AuthControl: React.FC<AuthControlProps> = ({ className = "" }) => {
  const { data: session, status } = useSession();
  const [providerIds, setProviderIds] = useState<string[] | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    getProviders().then((providers) => {
      if (!mounted || !providers) return;
      setProviderIds(Object.keys(providers));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSignIn = () => {
    if (!providerIds || providerIds.length === 0) return;
    if (providerIds.includes(PREVIEW_STUB_PROVIDER_ID)) {
      signIn(PREVIEW_STUB_PROVIDER_ID, { email: PREVIEW_STUB_TEST_EMAIL });
      return;
    }
    setShowSignInModal(true);
  };

  if (status === "loading") return null;

  if (session?.user) {
    return (
      <button
        type="button"
        className={`${className} ${styles.signOutButton}`.trim()}
        aria-label="Sign out"
        onClick={() => signOut()}
      >
        <FaSignOutAlt size={16} className={styles.icon} />
        <span className={styles.nameLabel}>
          {session.user.name ? `Sign out (${session.user.name})` : "Sign out"}
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${className} ${styles.signInButton}`.trim()}
        aria-label="Sign in"
        onClick={handleSignIn}
        disabled={!providerIds || providerIds.length === 0}
      >
        <FaSignInAlt size={16} className={styles.icon} />
        <span className={styles.signInLabel}>
          Sign in
        </span>
      </button>
      <SignInModal show={showSignInModal} onClose={() => setShowSignInModal(false)} />
    </>
  );
};

export default AuthControl;
