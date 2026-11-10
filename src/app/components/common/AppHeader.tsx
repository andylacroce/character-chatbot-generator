/**
 * Shared sticky app header: the hamburger dropdown, a focal `center` slot, and an optional
 * left-aligned slot. Used by the chat, game, landing (a rotating character carousel
 * centered), Character Wall, leaderboard and admin pages, so every page shares one sticky,
 * responsive shell.
 *
 * - A page-level navigation action (the Character Wall's and leaderboard's "Back" link,
 *   BackHomeLink.tsx) goes in `left`, not `center`: it reads as navigation, not as the
 *   header's focal content.
 * - The hamburger always sits on the right, with clearance beyond the page's own content
 *   padding (see `.headerRight`'s mobile rule in AppHeader.module.css). One consistent
 *   position beats matching clearance on two mirrored edges.
 * - The dark-mode toggle is its own icon button next to the hamburger on every page, so it
 *   is one tap away.
 * - A signed-in user's identity/name status is folded into the dropdown by whichever
 *   page's `menuItems` includes it (see useAccountMenu.tsx); there is no separate
 *   identity-chip trigger.
 */

import React from "react";
import styles from "../styles/AppHeader.module.css";
import HamburgerMenu from "./HamburgerMenu";
import DarkModeToggle from "./DarkModeToggle";

interface AppHeaderProps {
  /** Content for the hamburger's dropdown. */
  menuItems: React.ReactNode;
  /** Center content — chat's avatar+name button, or the landing page's character carousel. */
  center?: React.ReactNode;
  /** Lets a visual center treatment use the full header canvas behind empty side slots. */
  wideCenter?: boolean;
  /**
   * Left-aligned content — currently just the Character Wall's and leaderboard's "Back"
   * link (see BackHomeLink.tsx). Left empty (the default) on every other page, in which
   * case this column is just the same fixed-floor spacer it always was, keeping
   * .headerCenter symmetric between .headerLeft and .headerRight — see
   * AppHeader.module.css's doc comment on `.chatHeaderContent`.
   */
  left?: React.ReactNode;
}

/** Shared sticky header: a centered focal slot, and a dark-mode toggle + hamburger always on the right. */
const AppHeader: React.FC<AppHeaderProps> = ({ menuItems, center, wideCenter = false, left }) => {
  return (
    <div className={styles.chatHeader} data-testid="app-header" role="banner">
      <div
        className={`${styles.chatHeaderContent} ${wideCenter ? styles.chatHeaderContentWide : ""}`.trim()}
      >
        <div className={styles.headerLeft}>{left}</div>
        <div
          className={`${styles.headerCenter} ${wideCenter ? styles.headerCenterWide : ""}`.trim()}
        >
          {center}
        </div>
        <div className={styles.headerRight}>
          <DarkModeToggle hideLabel />
          <HamburgerMenu>{menuItems}</HamburgerMenu>
        </div>
      </div>
    </div>
  );
};

export default AppHeader;
