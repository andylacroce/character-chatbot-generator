// =============================
// AuthControl.tsx
// Sign in / sign out control. Renders nothing while the session is loading,
// to avoid a flash between signed-out and signed-in states.
//
// Signs in directly against the active provider rather than routing through
// NextAuth's built-in provider-picker page — that page only earns its keep once
// there's an actual choice to make. Today there's exactly one provider (Google
// in prod/dev, the preview stub on Vercel preview deployments — see
// authOptions.ts's prod/preview swap), so the single-provider case skips it
// entirely. Once a second real provider (planned: Facebook) is configured
// alongside Google, this falls back to the picker page rather than silently
// guessing which one the user wants — replace that fallback with in-app
// provider-choice buttons at that point instead of reaching for the picker.
// On preview, the stub signs in immediately as a fixed test identity with no
// prompt, since it's a smoke-test aid, not a real login.
// =============================

import React, { useEffect, useState } from "react";
import { useSession, signIn, signOut, getProviders } from "next-auth/react";
import { FaGoogle, FaSignOutAlt } from "react-icons/fa";

interface AuthControlProps {
  className?: string;
}

const PREVIEW_STUB_PROVIDER_ID = "preview-stub";
const PREVIEW_STUB_TEST_EMAIL = "preview-test@example.com";

const AuthControl: React.FC<AuthControlProps> = ({ className = "" }) => {
  const { data: session, status } = useSession();
  const [providerIds, setProviderIds] = useState<string[] | null>(null);

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
    if (providerIds.length > 1) {
      // More than one real provider configured — defer to NextAuth's picker
      // until there's an in-app choice UI for it.
      signIn();
      return;
    }
    const [id] = providerIds;
    if (id === PREVIEW_STUB_PROVIDER_ID) {
      signIn(id, { email: PREVIEW_STUB_TEST_EMAIL });
    } else {
      signIn(id);
    }
  };

  if (status === "loading") return null;

  if (session?.user) {
    return (
      <button
        type="button"
        className={className}
        aria-label="Sign out"
        onClick={() => signOut()}
      >
        <FaSignOutAlt size={16} style={{ color: "var(--color-accent, #1e7f6c)" }} />
        <span style={{ fontSize: "0.92rem", marginLeft: "0.18em" }}>
          {session.user.name ? `Sign out (${session.user.name})` : "Sign out"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label="Sign in"
      onClick={handleSignIn}
      disabled={!providerIds || providerIds.length === 0}
    >
      <FaGoogle size={16} style={{ color: "var(--color-accent, #1e7f6c)" }} />
      <span style={{ fontSize: "0.92rem", marginLeft: "0.18em" }}>Sign in</span>
    </button>
  );
};

export default AuthControl;
