"use client";

/**
 * A "Back to Home" pill button with a house glyph — the one consistent look for this
 * action wherever it appears outside a hamburger dropdown (the Character Wall's header,
 * the guessing game's start screen), instead of each page styling its own plain text
 * link. Icon color/size matches every hamburger-menu item's icon (see globals.css's
 * `.menuIcon` utility) so the visual language stays the same whether the action lives in
 * a dropdown row or a standalone button.
 */

import React from "react";
import Link from "next/link";
import { FaHome } from "react-icons/fa";
import styles from "./styles/BackHomeLink.module.css";

interface BackHomeLinkProps {
  /** Extra behavior on click, e.g. the guessing game ending its run before navigating. */
  onClick?: () => void;
  className?: string;
}

/** "Back to Home" pill button with a house glyph — see module doc above. */
const BackHomeLink: React.FC<BackHomeLinkProps> = ({ onClick, className = "" }) => (
  <Link href="/" className={`${styles.backHomeButton} ${className}`.trim()} onClick={onClick}>
    <FaHome size={18} className="menuIcon" />
    <span>Back to Home</span>
  </Link>
);

export default BackHomeLink;
