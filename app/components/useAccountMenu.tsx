"use client";

/**
 * Shared "account" bundle for a page's AppHeader hamburger: the identity chip label
 * ("Guest" or the visitor's name), the menu items (change name, an "Admin Stats" link
 * when the signed-in caller is an admin, sign in/out), and the modals those items open
 * (NameCaptureModal, SignInModal). Used identically by BotCreator.tsx and
 * CharsGallery.tsx — the two pages with an identity-chip trigger — so this logic lives
 * in exactly one place instead of being copy-pasted per page. Deliberately not used by
 * ChatPage.tsx, which keeps its own plain hamburger-icon menu (no identity chip, no
 * sign-in/admin items) — see its own doc comment for why sign-in stays out of chat.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, getProviders } from "next-auth/react";
import { FaUser, FaUserShield } from "react-icons/fa";
import { authenticatedFetch } from "../../src/utils/api";
import AuthControl from "./AuthControl";
import { NameCaptureModal } from "./NameCaptureModal";
import SignInModal from "./SignInModal";
import { useUserName, type UserNameContext } from "./useUserName";

export interface AccountMenu {
  /** The visitor's own name/sign-in context — e.g. for useBotCreation's post-creation name gate. */
  userNameCtx: UserNameContext;
  /** Label for the hamburger's trigger chip: the visitor's name, their account name/email, or "Guest". */
  identityLabel: string;
  /** Menu items to render inside the page's AppHeader `menuItems` slot. */
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

  const menuItems = (
    <>
      <button type="button" onClick={() => setShowEditNameModal(true)}>
        <FaUser size={16} />
        <span>{userNameCtx.name ? "Change your name" : "Add your name"}</span>
      </button>
      {isAdmin && (
        <Link href="/admin">
          <FaUserShield size={16} />
          <span>Admin Stats</span>
        </Link>
      )}
      <AuthControl onRequestSignIn={requestSignIn} />
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

  return { userNameCtx, identityLabel, menuItems, modals, requestSignIn };
}
