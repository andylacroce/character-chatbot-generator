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

  React.useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('darkMode') : null;
    if (stored !== null) setDarkMode(stored === 'true');
    else setDarkMode(true); // Default to dark mode if not set
  }, []);

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
