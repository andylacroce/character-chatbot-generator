import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";
import { BRAND } from "../theme";

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** Site name plus Beta badge for the Creator screen's header, mirroring web's landing header. */
export default function BrandTitle() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text style={styles.name}>{BRAND.name}</Text>
      <Text style={styles.beta}>{BRAND.betaLabel}</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    name: { fontFamily: serif, fontSize: 24, fontWeight: "700", color: colors.primary },
    beta: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.warning,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: 999,
      paddingVertical: 2,
      paddingHorizontal: 8,
      overflow: "hidden",
    },
  });
}
