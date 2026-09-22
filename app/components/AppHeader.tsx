/**
 * Shared sticky app header — the hamburger dropdown and a focal center slot, plus an
 * optional left-aligned slot. Used by the chat page (avatar+name centered), the game
 * page (same shape as chat), the landing page (a rotating character carousel centered),
 * and the Character Wall/leaderboard/admin pages — one implementation of the header
 * chrome instead of every page reinventing the same sticky/responsive shell. The
 * Character Wall and leaderboard pass a "Back" link (BackHomeLink.tsx) as `left` rather
 * than `center` — a page-level navigation action reads as left-aligned, not as the
 * header's focal content, which is why it moved out of `center` (see git history around
 * 2026-09-22 if that placement is ever worth revisiting).
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
 * The dark-mode toggle is its own small icon button in the header, next to the
 * hamburger, on every page — reversed 2026-09-22 back from an earlier design that
 * folded it into the hamburger dropdown. That earlier version traded a step of
 * discoverability (toggling theme took an extra tap to open the menu first) to save a
 * row of mobile header space; the user asked for the toggle to be visible and reachable
 * in one tap again, so it's back as a standalone control. A signed-in user's identity/
 * name status stays folded into the dropdown, by whichever page's `menuItems` includes
 * it (see useAccountMenu.tsx) — there's no separate identity-chip trigger, every page
 * uses the plain 3-bar icon for that.
 */

import React from "react";
import styles from "./styles/AppHeader.module.css";
import HamburgerMenu from "./HamburgerMenu";
import DarkModeToggle from "./DarkModeToggle";

interface AppHeaderProps {
  /** Content for the hamburger's dropdown. */
  menuItems: React.ReactNode;
  /** Center content — chat's avatar+name button, or the landing page's character carousel. */
  center?: React.ReactNode;
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
const AppHeader: React.FC<AppHeaderProps> = ({ menuItems, center, left }) => {
  return (
    <div className={styles.chatHeader} data-testid="app-header" role="banner">
      <div className={styles.chatHeaderContent}>
        <div className={styles.headerLeft}>{left}</div>
        <div className={styles.headerCenter}>{center}</div>
        <div className={styles.headerRight}>
          <DarkModeToggle hideLabel />
          <HamburgerMenu>{menuItems}</HamburgerMenu>
        </div>
      </div>
    </div>
  );
};

export default AppHeader;
