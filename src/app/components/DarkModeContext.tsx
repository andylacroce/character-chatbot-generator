// =============================
// DarkModeContext.tsx
// React context for managing and providing dark mode state across the app.
// Used by DarkModeToggle and layout components.
// =============================

"use client";

import React from "react";
import { STORAGE_KEYS } from "character-chatbot-shared";

interface DarkModeContextType {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

/**
 * Whether the app defaults to dark mode for a visitor with no stored preference yet
 * (an explicit toggle choice always overrides this on return visits) — the one place
 * to change the web app's default theme going forward. `app/layout.tsx` imports this
 * directly so the server-rendered `<html>` class matches on first paint, instead of
 * hardcoding "dark" separately and risking the two drifting out of sync. Mirrors
 * `character-chatbot-shared`'s own `DEFAULT_DARK_MODE` (mobile imports that one) —
 * kept as a separate local constant rather than importing from the shared package,
 * matching this file's not-yet-migrated-to-shared status (see that package's
 * `theme.ts` doc comment).
 */
export const DEFAULT_DARK_MODE = true;

export const DarkModeContext = React.createContext<DarkModeContextType>({
  darkMode: DEFAULT_DARK_MODE,
  setDarkMode: () => {},
});

export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkMode] = React.useState(DEFAULT_DARK_MODE);

  // This provider wraps the SSR'd root layout, so the initial render must match on server
  // and client (both default to DEFAULT_DARK_MODE) — reading localStorage has to happen
  // here, post-mount, rather than in the useState initializer, or the client's first
  // render would diverge from the server-rendered HTML and trigger a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.darkMode) : null;
    if (stored !== null) setDarkMode(stored === "true");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.darkMode, String(darkMode));
      if (darkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [darkMode]);

  return (
    <DarkModeContext.Provider value={{ darkMode, setDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
};
