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
import { flushSync } from "react-dom";
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

  // Keyboard accessibility: open/close with Enter/Space, close with Escape
  function handleButtonKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === "Enter" || e.key === " ")) {
      setOpen((v) => !v);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Enhance children to close menu on click
  const enhancedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    // Enhance if native button or a function/class component with onClick prop
    const isButtonLike =
      child.type === "button" ||
      (typeof child.type === "string" && child.type === "button") ||
      (typeof child.type === "function" && child.props && Object.prototype.hasOwnProperty.call(child.props, "onClick"));
    if (isButtonLike && child.props) {
      const originalOnClick = (child as React.ReactElement<{ onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }>).props.onClick;
      return React.cloneElement(child as React.ReactElement<{ onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }>, {
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          flushSync(() => setOpen(false));
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
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleButtonKeyDown}
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
