import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  CAROUSEL_ROTATE_MS,
  displayCharacterName,
  randomDrift,
  useCharacterCarousel,
} from "character-chatbot-shared";
import { getCarouselSample, resolveApiUrl } from "../api";
import { carouselCache } from "../storage";
import { useTheme } from "../ThemeContext";

type Props = {
  /** Tapping the name pill launches that character, same pipeline as CharWallScreen's tiles. */
  onSelect: (name: string) => void;
  /** Disable taps while a creation is already in flight (CreatorScreen's own busy state). */
  disabled?: boolean;
};

// Visible controls are 36pt; this pads each hit area out to the 44pt touch minimum.
const TOUCH_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * Full-screen rotating portrait behind the Creator screen, with the current character's
 * name as a tappable pill at the top-right. Mirrors the web app's LandingCharacterCarousel
 * "backdrop" variant; data, local cache and rotation come from character-chatbot-shared's
 * useCharacterCarousel, shared with it. Must sit behind the screen content (render it
 * first inside the screen container); the image layer ignores touches so the form works.
 */
export default function CharacterCarousel({ onSelect, disabled }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false);
  const { characters, index, step } = useCharacterCarousel({
    fetchSample: getCarouselSample,
    cache: carouselCache,
    paused: paused || Boolean(disabled),
  });

  const drift = useRef(new Animated.Value(0)).current;
  const currentName = characters.length ? characters[index % characters.length].name : "";
  const { width, height } = useWindowDimensions();
  // A new random motion per portrait (shared with web's backdrop).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-roll only when the portrait changes
  const spec = useMemo(() => randomDrift(), [currentName]);

  // Slow push-in and drift per portrait, restarted on each rotation. Runs a little past
  // the rotation interval so it is still moving when the next portrait cross-fades in.
  useEffect(() => {
    if (!currentName) return;
    drift.setValue(0);
    const run = Animated.timing(drift, {
      toValue: 1,
      duration: CAROUSEL_ROTATE_MS + 1000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [currentName, drift]);

  if (characters.length === 0) return null;

  const current = characters[index % characters.length];
  const name = displayCharacterName(current.name);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  scale: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [spec.scaleFrom, spec.scaleTo],
                  }),
                },
                {
                  translateX: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [(spec.fromX * width) / 100, (spec.toX * width) / 100],
                  }),
                },
                {
                  translateY: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [(spec.fromY * height) / 100, (spec.toY * height) / 100],
                  }),
                },
              ],
            },
          ]}
        >
          <Image
            source={{ uri: resolveApiUrl(current.avatarUrl) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
            transition={700}
          />
        </Animated.View>
        <LinearGradient
          colors={["transparent", colors.background]}
          style={[StyleSheet.absoluteFill, styles.veil]}
        />
      </View>
      <View style={[styles.nav, { bottom: insets.bottom + 12 }]}>
        <Pressable
          style={styles.arrow}
          onPress={() => step(-1)}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          hitSlop={TOUCH_SLOP}
          accessibilityLabel="Previous character"
        >
          <Ionicons name="chevron-back" size={18} color="#f5f1e6" />
        </Pressable>
        <Pressable
          style={styles.pill}
          onPress={() => onSelect(current.name)}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          disabled={disabled}
          hitSlop={TOUCH_SLOP}
          accessibilityLabel={`Chat with ${name}`}
        >
          <Text style={styles.pillText} numberOfLines={1}>
            {name}
          </Text>
        </Pressable>
        <Pressable
          style={styles.arrow}
          onPress={() => step(1)}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          hitSlop={TOUCH_SLOP}
          accessibilityLabel="Next character"
        >
          <Ionicons name="chevron-forward" size={18} color="#f5f1e6" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: { opacity: 0.45 },
  // Arrows at the screen edges, name centered between them (equal-width arrows plus
  // space-between keeps the pill centered however long the name is).
  nav: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 16, 10, 0.55)",
  },
  pill: {
    flexShrink: 1,
    marginHorizontal: 10,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(20, 16, 10, 0.55)",
  },
  pillText: { fontFamily: serif, fontSize: 14, fontWeight: "600", color: "#f5f1e6" },
});
