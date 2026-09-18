/**
 * Shared sticky app header — the hamburger dropdown and a focal center slot. Used by
 * the chat page (avatar+name centered), the game page (same shape as chat), the
 * landing page (a rotating character carousel centered), and the Character Wall/admin
 * pages — one implementation of the header chrome instead of every page reinventing
 * the same sticky/responsive shell.
 *
 * The hamburger has a single standing position — the header's right side, on every
 * page — rather than the left/right split an earlier version had (chat/game on the
 * left, everything else on the right). Standardized 2026-09-17 after a live mobile
 * report that the icon "sits too far right-aligned"; the real bug turned out to be
 * that whichever edge it was on, it had zero breathing room beyond the page's own
 * content padding (see `.headerRight`'s mobile rule in AppHeader.module.css). Fixing
 * that plus giving the icon one consistent location everywhere was simpler and more
 * predictable than maintaining matching clearance on two mirrored edges. Chat/game's
 * personal brand link (Andy's site) that used to occupy the header's other side was
 * removed rather than relocated — the user confirmed they're fine losing it in
 * exchange for the consistent hamburger position.
 *
 * The dark-mode toggle lives inside the hamburger dropdown (appended here, after each
 * caller's own `menuItems`) rather than as its own header control — previously every
 * page rendered a separate toggle button beside/below the hamburger, which ate a whole
 * extra row of vertical space on a mobile header that already has to fit a name, an
 * avatar, and (on the landing page) an identity chip in ~390px. A signed-in user's
 * identity/name status is folded into the dropdown the same way, by whichever page's
 * `menuItems` includes it (see useAccountMenu.tsx) — there's no separate identity-chip
 * trigger anymore, every page uses the plain 3-bar icon.
 */

import React from "react";
import styles from "./styles/AppHeader.module.css";
import HamburgerMenu from "./HamburgerMenu";
import DarkModeToggle from "./DarkModeToggle";

interface AppHeaderProps {
  /** Content for the hamburger's dropdown. */
  menuItems: React.ReactNode;
  /** Center content — chat's avatar+name button, or the landing page's character carousel. */
  center: React.ReactNode;
}

/** Shared sticky header: a centered focal slot, and the hamburger (dark mode toggle folded into its dropdown) always on the right. */
const AppHeader: React.FC<AppHeaderProps> = ({ menuItems, center }) => {
  return (
    <div className={styles.chatHeader} data-testid="app-header" role="banner">
      <div className={styles.chatHeaderContent}>
        <div className={styles.headerLeft} />
        <div className={styles.headerCenter}>{center}</div>
        <div className={styles.headerRight}>
          <HamburgerMenu>
            {menuItems}
            <div className="menuDivider" role="separator" />
            <DarkModeToggle className={styles.menuDarkModeToggle} />
          </HamburgerMenu>
        </div>
      </div>
    </div>
  );
};

export default AppHeader;
