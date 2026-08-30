// =============================
// DarkModeToggle.tsx
// Button component for toggling dark mode on and off.
// Consumes DarkModeContext and updates theme.
// =============================

import React, { useContext } from "react";
import { DarkModeContext } from "./DarkModeContext";
import styles from "./styles/ChatHeader.module.css";
import { FaSun, FaMoon } from "react-icons/fa";

interface DarkModeToggleProps {
  className?: string;
  hideLabel?: boolean;
}

const DarkModeToggle: React.FC<DarkModeToggleProps> = ({ className = "", hideLabel = false }) => {
  const { darkMode, setDarkMode } = useContext(DarkModeContext);
  return (
    <button
      type="button"
      className={`${styles.darkModeToggle} ${className}`.trim()}
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setDarkMode(!darkMode)}
    >
      {darkMode ? (
        <>
          <FaSun size={16} className={styles.toggleIcon} />
          {!hideLabel && <span className={styles.toggleText}>Light</span>}
        </>
      ) : (
        <>
          <FaMoon size={16} className={styles.toggleIcon} />
          {!hideLabel && <span className={styles.toggleText}>Dark</span>}
        </>
      )}
    </button>
  );
};

export default DarkModeToggle;
