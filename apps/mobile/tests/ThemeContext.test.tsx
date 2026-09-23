import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS, darkColors, lightColors, DEFAULT_DARK_MODE } from "character-chatbot-shared";
import { ThemeProvider, useTheme } from "../src/ThemeContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeContext", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to the shared package's DEFAULT_DARK_MODE", async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() =>
      expect(result.current.colors).toBe(DEFAULT_DARK_MODE ? darkColors : lightColors),
    );
    expect(result.current.darkMode).toBe(DEFAULT_DARK_MODE);
  });

  it("adopts a persisted dark-mode preference on mount", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.darkMode, String(!DEFAULT_DARK_MODE));
    const { result } = await renderHook(() => useTheme(), { wrapper });

    await waitFor(() => expect(result.current.darkMode).toBe(!DEFAULT_DARK_MODE));
  });

  it("toggleDarkMode flips the mode and persists it", async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });
    const initial = result.current.darkMode;

    await act(async () => {
      result.current.toggleDarkMode();
    });

    expect(result.current.darkMode).toBe(!initial);
    expect(result.current.colors).toBe(!initial ? darkColors : lightColors);
    await expect(AsyncStorage.getItem(STORAGE_KEYS.darkMode)).resolves.toBe(String(!initial));
  });

  it("toggling twice returns to the original mode", async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });
    const initial = result.current.darkMode;

    await act(async () => {
      result.current.toggleDarkMode();
    });
    await act(async () => {
      result.current.toggleDarkMode();
    });

    expect(result.current.darkMode).toBe(initial);
  });
});
