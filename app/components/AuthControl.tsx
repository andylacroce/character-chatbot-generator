// =============================
// AuthControl.tsx
// Sign in / sign out control. Renders nothing while the session is loading,
// to avoid a flash between signed-out and signed-in states.
//
// Signs in directly against the active provider rather than routing through
// NextAuth's built-in provider-picker page — that page only earns its keep once
// there's an actual choice to make. On preview (just the stub — see
// authOptions.ts's prod/preview swap), that single-provider case skips the
// picker entirely and signs in immediately as a fixed test identity with no
// prompt, since it's a smoke-test aid, not a real login. Outside preview,
// there are now two real providers (Google, Facebook), so this falls back to
// the picker page rather than silently guessing which one the user wants —
// replace that fallback with in-app provider-choice buttons if that page ever
// stops being good enough.
// =============================

import React, { useEffect, useState } from "react";
import { useSession, signIn, signOut, getProviders } from "next-auth/react";
import { FaGoogle, FaSignInAlt, FaSignOutAlt } from "react-icons/fa";

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
        style={{ minWidth: 0, maxWidth: "100%" }}
      >
        <FaSignOutAlt size={16} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span
          style={{
            fontSize: "0.92rem",
            marginLeft: "0.18em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {session.user.name ? `Sign out (${session.user.name})` : "Sign out"}
        </span>
      </button>
    );
  }

  // With a single provider, the icon can name it (Google today, or the preview stub, which
  // never reaches this branch since it always has length 1 too but isn't Google — see
  // below). Once there's an actual choice (Google + Facebook), a specific provider's icon
  // would misrepresent what clicking actually does (open the picker), so it goes generic.
  const isSingleGoogleProvider = providerIds?.length === 1 && providerIds[0] !== PREVIEW_STUB_PROVIDER_ID;

  return (
    <button
      type="button"
      className={className}
      aria-label="Sign in"
      onClick={handleSignIn}
      disabled={!providerIds || providerIds.length === 0}
    >
      {isSingleGoogleProvider ? (
        <FaGoogle size={16} style={{ color: "var(--color-accent)" }} />
      ) : (
        <FaSignInAlt size={16} style={{ color: "var(--color-accent)" }} />
      )}
      <span style={{ fontSize: "0.92rem", marginLeft: "0.18em" }}>Sign in</span>
    </button>
  );
};

export default AuthControl;
