import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import type { ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";

type Props = {
  label: string;
  onPress: () => void;
  /** "primary" is the filled call to action; "secondary" is outlined. */
  variant?: "primary" | "secondary";
  disabled?: boolean;
  /** Shows a spinner in place of the label. */
  busy?: boolean;
};

/**
 * The app's pill button. Primary pairs colors.primary with colors.onPrimary, the theme's
 * verified contrast pairing (4.8:1 light / 6.6:1 dark, see ChatView's send button).
 */
export default function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: primary ? "rgba(255,255,255,0.25)" : colors.secondaryContainer }}
      style={[
        styles.base,
        primary ? styles.primary : styles.secondary,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.text} />
      ) : (
        <Text style={primary ? styles.primaryText : styles.secondaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // overflow: hidden clips the ripple to the rounded corners (no elevation, which washes
    // the background out on Android once combined with it).
    base: {
      borderRadius: 24,
      paddingVertical: 13,
      paddingHorizontal: 24,
      alignItems: "center",
      alignSelf: "stretch",
      overflow: "hidden",
    },
    primary: { backgroundColor: colors.primary },
    secondary: { borderWidth: 1, borderColor: colors.outline },
    disabled: { opacity: 0.6 },
    primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: "600" },
    secondaryText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  });
}
