// =============================
// DarkModeContext.tsx
// React context for managing and providing dark mode state across the app.
// Used by DarkModeToggle and layout components.
// =============================

"use client";

import React from "react";

interface DarkModeContextType {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

export const DarkModeContext = React.createContext<DarkModeContextType>({
  darkMode: false,
  setDarkMode: () => {},
});

export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to dark mode
  const [darkMode, setDarkMode] = React.useState(true);

  // This provider wraps the SSR'd root layout, so the initial render must match on server
  // and client (both default to true) — reading localStorage has to happen here, post-mount,
  // rather than in the useState initializer, or the client's first render would diverge from
  // the server-rendered HTML and trigger a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('darkMode') : null;
    if (stored !== null) setDarkMode(stored === 'true');
    else setDarkMode(true); // Default to dark mode if not set
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(darkMode));
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
