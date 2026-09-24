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
//
// Signing in AND signing out both always redirect to "/" (callbackUrl),
// regardless of which page triggered them — this control (and SignInModal,
// which this component opens) is now reachable from the chat and game
// headers too (see useAccountMenu.tsx), and NextAuth's own default (redirect
// back to the current URL) would otherwise drop a visitor back into the
// middle of a chat/game session after signing in or out, rather than
// somewhere that makes sense either way.
//
// callbackUrl: "/" alone isn't enough, though: app/index.tsx's Home component
// renders ChatPage instead of the landing page whenever a bot session is still
// in localStorage, regardless of navigation intent — so landing on "/" after
// signing in/out would still show whatever chat was already open. clearStoredBot()
// (called here, and by SignInModal's Google button, before the redirect actually
// fires) clears that session pointer first, the same cleanup "Back to Character
// Creator" already does, so "/" reliably renders the actual landing page.
// =============================

import React, { useEffect, useState } from "react";
import { useSession, signIn, signOut, getProviders } from "next-auth/react";
import { FaSignInAlt, FaSignOutAlt } from "react-icons/fa";
import SignInModal from "./SignInModal";
import { clearStoredBot } from "../../utils/getValidBotFromStorage";
import styles from "./styles/AuthControl.module.css";

interface AuthControlProps {
  className?: string;
  /**
   * When provided, "Sign in" calls this instead of opening AuthControl's own
   * SignInModal — for a caller (e.g. a hamburger menu) that needs the modal to render
   * outside its own DOM subtree, so it doesn't inherit that subtree's styling (a menu
   * dropdown's item-reset CSS, for instance) and to share one modal instance across
   * every "sign in" entry point instead of each rendering its own.
   */
  onRequestSignIn?: () => void;
}

const PREVIEW_STUB_PROVIDER_ID = "preview-stub";
const PREVIEW_STUB_TEST_EMAIL = "preview-test@example.com";

/** Sign in / sign out control; renders nothing while the session is loading. */
const AuthControl: React.FC<AuthControlProps> = ({ className = "", onRequestSignIn }) => {
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
      clearStoredBot();
      signIn(PREVIEW_STUB_PROVIDER_ID, { email: PREVIEW_STUB_TEST_EMAIL, callbackUrl: "/" });
      return;
    }
    if (onRequestSignIn) {
      onRequestSignIn();
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
        onClick={() => {
          clearStoredBot();
          signOut({ callbackUrl: "/" });
        }}
      >
        <FaSignOutAlt size={18} className={`menuIcon ${styles.icon}`} />
        <span className={styles.nameLabel}>
          {/* Magic-link users have no `name` (Email provider only ever knows the
              address) — fall back to email so a signed-in state always shows who
              you're signed in as, not a bare "Sign out". */}
          {session.user.name || session.user.email
            ? `Sign out (${session.user.name ?? session.user.email})`
            : "Sign out"}
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
        <FaSignInAlt size={18} className={`menuIcon ${styles.icon}`} />
        <span className={styles.signInLabel}>Sign in</span>
      </button>
      {!onRequestSignIn && (
        <SignInModal
          show={showSignInModal}
          onClose={() => setShowSignInModal(false)}
          providerIds={providerIds}
        />
      )}
    </>
  );
};

export default AuthControl;
