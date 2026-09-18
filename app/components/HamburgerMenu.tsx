import React, { useState, useRef, useEffect } from "react";
import styles from "./styles/HamburgerMenu.module.css";

interface HamburgerMenuProps {
  children: React.ReactNode;
}

/**
 * Accessible hamburger menu for mobile/desktop navigation. Renders a button and
 * dropdown for menu actions, with keyboard and focus support, and closes the dropdown
 * whenever anything inside it is clicked. Always sits at its wrapper's right edge and
 * opens the dropdown from that same edge — see AppHeader.tsx's doc comment for why the
 * hamburger has one standing position rather than a per-page left/right choice.
 */
const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    /** Closes the menu on any mousedown outside its wrapper. */
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  /** Keyboard accessibility: open/close with Enter/Space, close with Escape. */
  function handleButtonKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      setOpen((v) => !v);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Closes the menu on any click inside the dropdown, via bubbling — this reaches every
  // actionable child (button, link, or component rendering one) regardless of how deeply
  // it's nested or whether it's wrapped in a Fragment, unlike the previous approach of
  // cloning direct children with an enhanced onClick, which silently missed anything
  // passed in as a single Fragment (menuItems is always `<>...</>` in every caller) —
  // real menu items never actually got the auto-close behavior, leaving the dropdown
  // open behind whatever the click did (e.g. a confirmation dialog or another modal).
  // The child's own onClick still fires first (real DOM bubbling is innermost-first),
  // so this never races with the action the click was meant to perform.
  const handleDropdownClick = () => setOpen(false);

  return (
    <div className={styles.menuWrapper} ref={wrapperRef}>
      <button
        className={styles.hamburger}
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleButtonKeyDown}
      >
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
      </button>
      {open && (
        <div className={styles.menuDropdown} onClick={handleDropdownClick}>
          {children}
        </div>
      )}
    </div>
  );
};

export default HamburgerMenu;
