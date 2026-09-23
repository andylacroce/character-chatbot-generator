import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { resolveApiUrl } from "../api";
import { useTheme } from "../ThemeContext";

type Props = {
  name: string;
  avatarUrl: string | null | undefined;
  size?: number;
  /** When given, the avatar becomes tappable (e.g. to open a lightbox). */
  onPress?: () => void;
};

/**
 * Circular character avatar. `expo-image` (like core RN Image) can't rasterize SVG, and
 * generate-avatar's own fallback is `/silhouette.svg` — so any `.svg` source, or one that
 * fails to load, falls back to the character's initial instead of a broken image.
 */
export default function Avatar({ name, avatarUrl, size = 40, onPress }: Props) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const usable = avatarUrl && !avatarUrl.endsWith(".svg") && !failed;

  const dimStyle = { width: size, height: size, borderRadius: size / 2 };

  const content = !usable ? (
    <View style={[styles.fallback, dimStyle, { backgroundColor: colors.secondaryContainer }]}>
      <Text style={[styles.initial, { fontSize: size * 0.45, color: colors.secondary }]}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  ) : (
    <Image
      testID="avatar-image"
      source={{ uri: resolveApiUrl(avatarUrl) }}
      style={dimStyle}
      contentFit="cover"
      onError={() => setFailed(true)}
    />
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.secondaryContainer, borderless: true }}
      accessibilityLabel={`View ${name}'s portrait`}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  initial: { fontWeight: "600" },
});
