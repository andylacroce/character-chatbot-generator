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
          <FaSun size={16} style={{ color: 'var(--color-accent, #ffd166)' }} />
          {!hideLabel && <span style={{ fontSize: '0.92rem', marginLeft: '0.18em' }}>Light</span>}
        </>
      ) : (
        <>
          <FaMoon size={16} style={{ color: 'var(--color-accent, #1e7f6c)' }} />
          {!hideLabel && <span style={{ fontSize: '0.92rem', marginLeft: '0.18em' }}>Dark</span>}
        </>
      )}
    </button>
  );
};

export default DarkModeToggle;
