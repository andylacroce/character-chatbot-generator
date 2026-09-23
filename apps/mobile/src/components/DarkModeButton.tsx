import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../ThemeContext";

/** Header light/dark toggle — every screen's default headerRight (see App.tsx). */
export default function DarkModeButton() {
  const { colors, darkMode, toggleDarkMode } = useTheme();
  return (
    <Pressable
      onPress={toggleDarkMode}
      hitSlop={8}
      android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 18 }}
      style={styles.button}
      accessibilityLabel={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Ionicons name={darkMode ? "sunny-outline" : "moon-outline"} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 6, marginRight: 4 },
});
