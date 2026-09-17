/**
 * Shared sticky app header — the hamburger dropdown and a focal center slot, plus an
 * optional extra slot on the opposite side. Used by the chat page (hamburger on the
 * left, avatar+name centered, a personal brand link on the right), the game page (same
 * shape as chat), and the landing page (hamburger on the right, a rotating character
 * carousel centered) — one implementation of the header chrome instead of three pages
 * each reinventing the same sticky/responsive shell.
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
  /**
   * Which side the hamburger renders on. Chat/game use "left" (their original
   * placement); the landing page and Character Wall use "right". The dropdown opens
   * from whichever edge keeps it on-screen.
   */
  menuSide?: "left" | "right";
  /** Center content — chat's avatar+name button, or the landing page's character carousel. */
  center: React.ReactNode;
  /** Content for the side opposite the hamburger (e.g. chat's personal brand link). */
  extra?: React.ReactNode;
}

/** Shared sticky header: hamburger (dark mode toggle folded into its dropdown), a center focal slot, and an optional extra slot. */
const AppHeader: React.FC<AppHeaderProps> = ({ menuItems, menuSide = "left", center, extra }) => {
  const menuCombo = (
    <HamburgerMenu align={menuSide}>
      {menuItems}
      <div className="menuDivider" role="separator" />
      <DarkModeToggle className={styles.menuDarkModeToggle} />
    </HamburgerMenu>
  );

  return (
    <div className={styles.chatHeader} data-testid="app-header" role="banner">
      <div className={styles.chatHeaderContent}>
        <div className={styles.headerLeft}>{menuSide === "left" ? menuCombo : extra}</div>
        <div className={styles.headerCenter}>{center}</div>
        <div className={styles.headerRight}>{menuSide === "right" ? menuCombo : extra}</div>
      </div>
    </div>
  );
};

export default AppHeader;
