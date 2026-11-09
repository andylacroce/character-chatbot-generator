"use client";

/**
 * Internal, admin-only view managing both character lists that short-circuit
 * pages/api/validate-character.ts before it ever calls Claude: the admin-managed
 * allowlist (src/utils/moderation/characterAllowlist.ts) and the blocklist (src/utils/
 * characterBlocklist.ts). Kept on one page, not two, since they're the same
 * moderation concern from opposite directions — an admin correcting a false
 * positive (allow) or confirming/pre-empting a real violation (block) is one
 * workflow, not two. Rendered only for a confirmed admin — app/admin/moderation/
 * page.tsx (a Server Component) 404s everyone else before this ever mounts.
 *
 * Uses the same shared AppHeader/useAccountMenu every other page uses, rather than a
 * bespoke standalone masthead, so this admin page's chrome doesn't drift from the
 * rest of the app. "Back to Home" lives in the hamburger menu (not the header's
 * center slot, unlike a page with real focal content there) since this page has
 * nothing else to put there.
 */

import React, { useCallback, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FaHome } from "react-icons/fa";
import AppHeader from "../../components/common/AppHeader";
import { useAccountMenu } from "../../components/account/useAccountMenu";
import styles from "../../components/styles/AdminModeration.module.css";
import { ModerationSection } from "./ModerationSection";
import { WarningLogSection } from "./WarningLogSection";

/** Admin moderation view (allowlist + blocklist) — see module doc above. */
export default function AdminModerationView() {
  const { status } = useSession();
  const { menuItems, modals } = useAccountMenu();
  // Bumped after any successful add/remove/transfer/warning-action anywhere on this
  // page, so every section refetches and shows the latest state — a change in one
  // section (e.g. the Warning Log's "Block" button) affects a list a sibling section
  // owns, which that sibling has no other way to learn about.
  const [refreshKey, setRefreshKey] = useState(0);
  const handleChanged = useCallback(() => setRefreshKey((k) => k + 1), []);

  const fullMenuItems = (
    <>
      <Link href="/">
        <FaHome size={18} className="menuIcon" />
        <span>Back to Home</span>
      </Link>
      <div className="menuDivider" role="separator" />
      {menuItems}
    </>
  );

  return (
    <>
      <AppHeader
        menuItems={fullMenuItems}
        center={<h1 className={styles.title}>Character moderation</h1>}
      />
      {modals}
      <div className={styles.page}>
        <div className={styles.header}>
          <p className={styles.subtitle}>
            Names here short-circuit copyright/trademark validation before it ever calls Claude — an
            allowed name is always safe, a blocked name is always rejected with a generic message,
            regardless of what a fresh classification might say.
          </p>
        </div>

        {status === "loading" && <p className={styles.state}>Loading session…</p>}
        {status === "unauthenticated" && <p className={styles.state}>Not signed in.</p>}

        {status === "authenticated" && (
          <>
            <WarningLogSection onChanged={handleChanged} />

            <div className={styles.grid}>
              <ModerationSection
                title="Allowed"
                hint="Always classified as safe (warningLevel: none), skipping Claude entirely."
                apiPath="/api/admin/allowlist"
                namePlaceholder="Character name to allow"
                addButtonLabel="Allow"
                removeButtonLabel="Remove"
                emptyMessage="No manually-allowed names."
                transferTo={{ apiPath: "/api/admin/blocklist", label: "Move to Blocked" }}
                refreshKey={refreshKey}
                onChanged={handleChanged}
              />
              <ModerationSection
                title="Blocked"
                hint="Always rejected with a generic message, skipping Claude entirely."
                apiPath="/api/admin/blocklist"
                namePlaceholder="Character name to block"
                addButtonLabel="Block"
                removeButtonLabel="Unblock"
                emptyMessage="No blocked names."
                transferTo={{ apiPath: "/api/admin/allowlist", label: "Move to Allowed" }}
                refreshKey={refreshKey}
                onChanged={handleChanged}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
