import React, { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import styles from "./styles/HamburgerMenu.module.css";

interface HamburgerMenuProps {
  children: React.ReactNode;
  /**
   * "right" opens the dropdown from the button's right edge instead of its left — for
   * a hamburger positioned near a header's right edge, so the dropdown doesn't overflow
   * off-screen. Defaults to "left" (the original chat-header placement).
   */
  align?: "left" | "right";
  /**
   * Custom trigger content replacing the default 3-bar icon — e.g. an identity chip
   * showing the visitor's current name or "Guest", so that status is visible without
   * opening the menu at all; opening it surfaces the actions (change name, sign in/out).
   */
  trigger?: React.ReactNode;
  /** Accessible label for a custom trigger — ignored when using the default icon. */
  triggerAriaLabel?: string;
}

/**
 * Accessible hamburger menu for mobile/desktop navigation. Renders a button and
 * dropdown for menu actions, with keyboard and focus support, and enhances
 * child buttons to close the menu on click.
 */
const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  children,
  align = "left",
  trigger,
  triggerAriaLabel,
}) => {
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

  // Enhance children to close menu on click
  const enhancedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    // Enhance if native button or a function/class component with onClick prop
    const isButtonLike =
      child.type === "button" ||
      (typeof child.type === "string" && child.type === "button") ||
      (typeof child.type === "function" &&
        child.props &&
        Object.prototype.hasOwnProperty.call(child.props, "onClick"));
    if (isButtonLike && child.props) {
      const originalOnClick = (
        child as React.ReactElement<{ onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }>
      ).props.onClick;
      return React.cloneElement(
        child as React.ReactElement<{ onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }>,
        {
          onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
            flushSync(() => setOpen(false));
            if (originalOnClick) originalOnClick(e);
          },
        },
      );
    }
    return child;
  });

  return (
    <div
      className={`${styles.menuWrapper} ${align === "right" ? styles.menuWrapperRight : ""}`.trim()}
      ref={wrapperRef}
    >
      <button
        className={trigger ? styles.triggerButton : styles.hamburger}
        aria-label={trigger ? (triggerAriaLabel ?? "Open menu") : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleButtonKeyDown}
      >
        {trigger ?? (
          <>
            <span className={styles.bar}></span>
            <span className={styles.bar}></span>
            <span className={styles.bar}></span>
          </>
        )}
      </button>
      {/* Right-alignment is handled by .menuWrapperRight's descendant selector on the
          wrapper above — the dropdown itself doesn't need its own conditional class. */}
      {open && <div className={styles.menuDropdown}>{enhancedChildren}</div>}
    </div>
  );
};

export default HamburgerMenu;
