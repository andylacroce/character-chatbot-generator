// =============================
// DarkModeContext.tsx
// React context for managing and providing dark mode state across the app.
// Used by DarkModeToggle and layout components.
// =============================

"use client";

import React from "react";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";

interface DarkModeContextType {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

export const DarkModeContext = React.createContext<DarkModeContextType>({
  darkMode: false,
  setDarkMode: () => {},
});

export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to light mode
  const [darkMode, setDarkMode] = React.useState(false);

  // This provider wraps the SSR'd root layout, so the initial render must match on server
  // and client (both default to false) — reading localStorage has to happen here, post-mount,
  // rather than in the useState initializer, or the client's first render would diverge from
  // the server-rendered HTML and trigger a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.darkMode) : null;
    if (stored !== null) setDarkMode(stored === 'true');
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.darkMode, String(darkMode));
      if (darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [darkMode]);

  return (
    <DarkModeContext.Provider value={{ darkMode, setDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
};
