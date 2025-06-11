/**
 * HamburgerMenu component
 *
 * Accessible hamburger menu for mobile/desktop navigation.
 * Renders a button and dropdown for menu actions, with keyboard and focus support.
 * Enhances child buttons to close the menu on click.
 *
 * @param {HamburgerMenuProps} props - The component props
 * @returns {JSX.Element} The rendered hamburger menu
 */

// =============================
// HamburgerMenu.tsx
// Accessible hamburger menu component for mobile and desktop navigation.
// Renders a button and dropdown for menu actions, with keyboard and focus support.
// =============================

import React, { useState, useRef, useEffect } from "react";
import styles from "./styles/HamburgerMenu.module.css";

interface HamburgerMenuProps {
  children: React.ReactNode;
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Enhance children to close menu on click
  const enhancedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    // Only enhance buttons
    if (
      (child.type === "button" ||
        (typeof child.type === "string" && child.type === "button")) &&
      child.props
    ) {
      const originalOnClick = (child as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>).props.onClick;
      return React.cloneElement(child as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>, {
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          setOpen(false);
          if (originalOnClick) originalOnClick(e);
        },
      });
    }
    return child;
  });

  return (
    <div className={styles.menuWrapper} ref={wrapperRef}>
      <button
        className={styles.hamburger}
        aria-label="Open menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
      </button>
      {open && (
        <div className={styles.menuDropdown}>{enhancedChildren}</div>
      )}
    </div>
  );
};

export default HamburgerMenu;
