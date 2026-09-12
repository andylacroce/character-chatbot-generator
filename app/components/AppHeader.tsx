/**
 * Shared sticky app header — the hamburger + dark-mode-toggle combo (with its
 * responsive inline-on-desktop/stacked-on-mobile layout), a focal center slot, and an
 * optional extra slot on the opposite side. Used by both the chat page (hamburger on
 * the left, avatar+name centered, a personal brand link on the right) and the landing
 * page (hamburger on the right, alongside the visitor's identity chip, a rotating
 * character carousel centered) — one implementation of the header chrome instead of
 * two pages each reinventing the same sticky/responsive shell.
 */

import React from "react";
import styles from "./styles/AppHeader.module.css";
import HamburgerMenu from "./HamburgerMenu";
import DarkModeToggle from "./DarkModeToggle";

interface AppHeaderProps {
  /** Content for the hamburger's dropdown. */
  menuItems: React.ReactNode;
  /** Custom hamburger trigger (e.g. the landing page's "Guest"/name identity chip) — omit for the default 3-bar icon. */
  menuTrigger?: React.ReactNode;
  menuTriggerAriaLabel?: string;
  /**
   * Which side the hamburger + dark-mode-toggle combo renders on. Chat uses "left"
   * (its original placement); the landing page uses "right" (an account-style control
   * reads naturally there, and it keeps the wordmark-adjacent side clear). The
   * dropdown opens from whichever edge keeps it on-screen.
   */
  menuSide?: "left" | "right";
  /** Center content — chat's avatar+name button, or the landing page's character carousel. */
  center: React.ReactNode;
  /** Content for the side opposite the hamburger (e.g. chat's personal brand link). */
  extra?: React.ReactNode;
}

/** Shared sticky header: hamburger + dark mode toggle, a center focal slot, and an optional extra slot. */
const AppHeader: React.FC<AppHeaderProps> = ({
  menuItems,
  menuTrigger,
  menuTriggerAriaLabel,
  menuSide = "left",
  center,
  extra,
}) => {
  const menuCombo = (
    <>
      <div className={styles.menuAndToggleRow}>
        <HamburgerMenu
          trigger={menuTrigger}
          triggerAriaLabel={menuTriggerAriaLabel}
          align={menuSide}
        >
          {menuItems}
        </HamburgerMenu>
        <span className={styles.desktopToggle}>
          <DarkModeToggle className={styles.darkModeToggle} />
        </span>
      </div>
      <span className={styles.mobileToggle}>
        <DarkModeToggle className={styles.darkModeToggle} />
      </span>
    </>
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
