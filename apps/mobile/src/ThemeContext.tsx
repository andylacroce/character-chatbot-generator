import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS, darkColors, lightColors, type ThemeColors } from "character-chatbot-shared";

interface ThemeContextValue {
  colors: ThemeColors;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  darkMode: false,
  toggleDarkMode: () => {},
});

/**
 * Mirrors the web app's DarkModeContext exactly: defaults to light, manual
 * toggle only (no OS `prefers-color-scheme` following), persisted under the
 * same STORAGE_KEYS.darkMode key the web app uses for localStorage.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.darkMode).then((stored) => {
      if (stored !== null) setDarkMode(stored === "true");
    });
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEYS.darkMode, String(next));
      return next;
    });
  };

  return (
    <ThemeContext.Provider
      value={{ colors: darkMode ? darkColors : lightColors, darkMode, toggleDarkMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
