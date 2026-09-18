"use client";

/**
 * Shared "account" bundle for a page's AppHeader hamburger: menu items leading with a
 * non-interactive identity label ("Guest" or the visitor's name), then change-name and
 * sign in/out — plus the modals those items open (NameCaptureModal, SignInModal). Used
 * by every page's header (BotCreator.tsx, CharsGallery.tsx, ChatPage.tsx, GamePage.tsx)
 * — each appends its own page-specific items first, then this hook's `menuItems`, so
 * this logic lives in exactly one place instead of being copy-pasted per page.
 *
 * When the signed-in caller is an admin, an "Admin" sub-section (its own divider +
 * label, same treatment as the top-level identity label) follows with links to each
 * separate admin page — /admin (stats) and /admin/moderation (the allowlist/blocklist/
 * warning-log panel, see AdminModerationView.tsx) — rather than cramming admin
 * functionality onto one page as it grows.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, getProviders } from "next-auth/react";
import { FaUser, FaUserShield, FaBan } from "react-icons/fa";
import { authenticatedFetch } from "../../src/utils/api";
import AuthControl from "./AuthControl";
import { NameCaptureModal } from "./NameCaptureModal";
import SignInModal from "./SignInModal";
import { useUserName, type UserNameContext } from "./useUserName";
import styles from "./styles/useAccountMenu.module.css";

export interface AccountMenu {
  /** The visitor's own name/sign-in context — e.g. for useBotCreation's post-creation name gate. */
  userNameCtx: UserNameContext;
  /**
   * Menu items to render inside the page's AppHeader `menuItems` slot — leads with a
   * non-interactive identity label (the visitor's name, account name/email, or "Guest")
   * so account status is visible on opening the menu, since there's no separate identity
   * chip trigger anymore (see AppHeader.tsx).
   */
  menuItems: React.ReactNode;
  /** Modals to render alongside the page's AppHeader (name-capture edit mode, shared sign-in). */
  modals: React.ReactNode;
  /**
   * Opens the shared SignInModal above — for a caller with its own extra sign-in entry
   * point (e.g. BotCreator's post-creation name gate) to reuse the same instance.
   */
  requestSignIn: () => void;
}

/** Builds the identity chip label, menu items, and modals shared by every page's account menu. */
export function useAccountMenu(): AccountMenu {
  const { data: session, status: sessionStatus } = useSession();
  const userNameCtx = useUserName();
  const [providerIds, setProviderIds] = useState<string[] | null>(null);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    getProviders().then((providers) => {
      if (mounted && providers) setProviderIds(Object.keys(providers));
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Resets isAdmin the moment sessionStatus drops out of "authenticated" — a plain state
  // update during render (React's "adjusting state when a prop changes" pattern) instead
  // of an effect, since it's purely derived from sessionStatus with no external system
  // involved. The real fetch below still needs a genuine effect.
  const [lastAdminCheckStatus, setLastAdminCheckStatus] = useState(sessionStatus);
  if (sessionStatus !== lastAdminCheckStatus) {
    setLastAdminCheckStatus(sessionStatus);
    if (sessionStatus !== "authenticated") setIsAdmin(false);
  }

  // Cheap, DB-free check (see pages/api/admin/is-admin.ts) purely to decide whether to
  // show the "Admin Stats" link — the real /api/admin/stats route enforces its own
  // access control independently, so this is never the actual security boundary.
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let mounted = true;
    authenticatedFetch("/api/admin/is-admin")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setIsAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        /* fails closed — no link shown */
      });
    return () => {
      mounted = false;
    };
  }, [sessionStatus]);

  const requestSignIn = () => setShowSignInModal(true);

  const identityLabel = session?.user
    ? userNameCtx.name || session.user.name || session.user.email || "Signed in"
    : userNameCtx.name || "Guest";

  // Ordered as: who-you-are (label), the one personal setting a guest can already
  // touch (name), then the account action that upgrades that identity (sign in/out).
  // Admin Stats is a different category entirely — site administration, not personal
  // account management — so it gets its own divider afterward rather than being
  // sandwiched between name-editing and sign-in.
  const menuItems = (
    <>
      <div className={styles.identityLabel}>{identityLabel}</div>
      <button type="button" onClick={() => setShowEditNameModal(true)}>
        <FaUser size={18} className="menuIcon" />
        <span>{userNameCtx.name ? "Change your name" : "Add your name"}</span>
      </button>
      <AuthControl onRequestSignIn={requestSignIn} />
      {isAdmin && (
        <>
          <div className="menuDivider" role="separator" />
          <div className={styles.identityLabel}>Admin</div>
          <Link href="/admin">
            <FaUserShield size={18} className="menuIcon" />
            <span>Stats</span>
          </Link>
          <Link href="/admin/moderation">
            <FaBan size={18} className="menuIcon" />
            <span>Moderation</span>
          </Link>
        </>
      )}
    </>
  );

  const modals = (
    <>
      <NameCaptureModal
        show={showEditNameModal}
        onClose={() => setShowEditNameModal(false)}
        mode="edit"
        currentName={userNameCtx.name}
        onSave={(name) => {
          userNameCtx.setName(name);
          setShowEditNameModal(false);
        }}
        onRequestSignIn={requestSignIn}
      />
      <SignInModal
        show={showSignInModal}
        onClose={() => setShowSignInModal(false)}
        providerIds={providerIds}
      />
    </>
  );

  return { userNameCtx, menuItems, modals, requestSignIn };
}
