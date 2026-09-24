"use client";

/**
 * NextAuth's configured `pages.signIn` page (see authOptions.ts). Reached two ways:
 * directly by a browser navigation (the mobile sign-in bridge's whole reason for
 * existing — see pages/api/auth/mobile-auth-start.ts's doc comment), and, since no
 * separate `pages.error` is configured, also for an `?error=` redirect after a failed
 * sign-in attempt. Web's own sign-in entry point is SignInModal.tsx (an in-app
 * lightbox using the same signIn() calls) and never navigates here in the ordinary
 * flow — this page exists for whoever/whatever lands on this URL directly.
 *
 * Deliberately does not use AppHeader/useAccountMenu — a "sign in" menu item pointing
 * back at this same page would be circular, and this page is reached mid-flow (often
 * from a bare browser tab with no app navigation context), not as a normal page-to-page
 * hop, so the minimal header (brand + dark-mode toggle only) fits better than the full
 * hamburger chrome every other page uses.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, getProviders } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";
import BackHomeLink from "./BackHomeLink";
import DarkModeToggle from "./DarkModeToggle";
import styles from "./styles/AuthSignInPage.module.css";

type MagicLinkStatus = "idle" | "sending" | "sent" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Couldn't start Google sign-in. Please try again.",
  OAuthCallback: "Google sign-in didn't complete. Please try again.",
  EmailSignin: "Couldn't send that link. Please check the address and try again.",
  Verification: "That sign-in link has expired or already been used.",
  Default: "Something went wrong signing you in. Please try again.",
};

/** NextAuth's configured sign-in page — see module doc above. */
export default function AuthSignInPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/";
  const errorCode = searchParams?.get("error") ?? null;
  // The mobile sign-in bridge (pages/api/auth/mobile-auth-start.ts) always sets
  // callbackUrl to its own mobile-auth-complete route — a reliable signal that this
  // page is running inside expo-web-browser's in-app browser tab, not an ordinary
  // browser. "Back to Home" would just navigate within that same tab (there's no way
  // for a page-level link to close it and hand control back to the native app — only
  // the browser's own native close/"Done" button, or a matching redirect, can do that),
  // so it's actively misleading there and gets swapped for guidance instead.
  const isMobileBridge = callbackUrl.includes("/api/auth/mobile-auth-complete");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<MagicLinkStatus>("idle");
  const [providerIds, setProviderIds] = useState<string[] | null>(null);

  useEffect(() => {
    let mounted = true;
    getProviders().then((providers) => {
      if (mounted && providers) setProviderIds(Object.keys(providers));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const hasGoogleProvider = providerIds?.includes("google") ?? false;
  const hasEmailProvider = providerIds?.includes("email") ?? false;

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    const result = await signIn("email", {
      email: email.trim(),
      redirect: false,
      callbackUrl,
    });
    setStatus(result?.error ? "error" : "sent");
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {isMobileBridge ? (
          <p className={styles.mobileBridgeHint}>Close this tab to return to the app</p>
        ) : (
          <BackHomeLink label="Back to Home" />
        )}
        <DarkModeToggle />
      </header>
      <main className={styles.main}>
        <p className={styles.wordmark}>Portrayal</p>
        <div className={styles.card}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.subtitle}>
            Save your characters and chat history to your account, so they&apos;re there next time
            you come back.
          </p>
          {errorCode && (
            <p className={styles.errorBanner} role="alert">
              {ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.Default}
            </p>
          )}
          {hasGoogleProvider && (
            <button
              type="button"
              className={styles.googleSignInButton}
              onClick={() => signIn("google", { callbackUrl })}
            >
              <FaGoogle size={18} />
              Continue with Google
            </button>
          )}
          {hasGoogleProvider && hasEmailProvider && <div className={styles.divider}>or</div>}
          {hasEmailProvider &&
            (status === "sent" ? (
              <p className={styles.magicLinkStatus} data-testid="magic-link-sent">
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
            ))}
          {hasEmailProvider && status === "error" && (
            <p className={styles.magicLinkStatus} data-tone="error">
              Couldn&apos;t send that link. Please try again.
            </p>
          )}
          {providerIds && !hasGoogleProvider && !hasEmailProvider && (
            <p className={styles.magicLinkStatus}>Sign-in is not available right now.</p>
          )}
        </div>
      </main>
    </div>
  );
}
