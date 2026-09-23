import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  displayCharacterName,
  useCharacterCarousel,
  type ThemeColors,
} from "character-chatbot-shared";
import { getCarouselSample } from "../api";
import { carouselCache } from "../storage";
import { useTheme } from "../ThemeContext";
import Avatar from "./Avatar";

type Props = {
  /** Tapping a portrait launches that character — same pipeline as CharWallScreen's tiles. */
  onSelect: (name: string) => void;
  /** Disable taps while a creation is already in flight (CreatorScreen's own busy state). */
  disabled?: boolean;
  /** Halo diameter; CreatorScreen shrinks it so the whole landing screen fits without scrolling. */
  size?: number;
};

/** Default (and maximum) halo diameter; the ring and portrait scale with it. */
export const CAROUSEL_MAX_SIZE = 210;
const RING_RATIO = 168 / 210;
const PORTRAIT_RATIO = 160 / 210;

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * Rotating, tappable sample of the shared character portrait cache. Its data, local cache
 * and 4s rotation come from character-chatbot-shared's useCharacterCarousel, the same hook
 * the web app's LandingCharacterCarousel.tsx uses. Placed in the Creator screen's body
 * instead of a header slot since the native-stack header here is already occupied.
 *
 * Goes further than the web version with effects only a native client can do cheaply:
 * a continuously slow-spinning gradient halo behind the portrait (ambient life even
 * between rotations), a pseudo-3D card-flip transition between characters instead of a
 * flat cross-fade, and haptic ticks synced to the flip and to selection.
 */
export default function CharacterCarousel({ onSelect, disabled, size = CAROUSEL_MAX_SIZE }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors, size);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { characters, index } = useCharacterCarousel({
    fetchSample: getCarouselSample,
    cache: carouselCache,
    paused: paused || Boolean(disabled),
  });
  const flip = useRef(new Animated.Value(0)).current;
  const haloSpin = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Continuous ambient rotation, independent of character switching — gives the halo
  // life even while the same portrait sits still for the full 4s.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(haloSpin, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [haloSpin]);

  // Pseudo-3D flip: rotate the card edge-on (with a slight squeeze + fade to sell the
  // perspective), swap the portrait while it's invisible at the edge, then rotate the
  // rest of the way back in from the opposite side — reads as a continuous flip rather
  // than a snap-back.
  useEffect(() => {
    if (index === displayIndex) return;
    Animated.timing(flip, {
      toValue: 1,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setDisplayIndex(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      flip.setValue(-1);
      Animated.timing(flip, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (characters.length === 0) return null;

  const current = characters[displayIndex % characters.length];

  const handlePressIn = () => {
    setPaused(true);
    Animated.spring(pressScale, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    setPaused(false);
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    pulse.setValue(0);
    Animated.timing(pulse, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    onSelect(current.name);
  };

  const cardStyle = {
    transform: [
      { perspective: 800 },
      {
        rotateY: flip.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: ["-90deg", "0deg", "90deg"],
        }),
      },
      {
        scaleX: flip.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.72, 1, 0.72] }),
      },
      { scale: pressScale },
    ],
    opacity: flip.interpolate({
      inputRange: [-1, -0.3, 0, 0.3, 1],
      outputRange: [0, 1, 1, 1, 0],
    }),
  };

  const haloRotate = haloSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const pulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
  };

  return (
    <Pressable
      style={styles.carousel}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityLabel={`Chat with ${displayCharacterName(current.name)}`}
    >
      <View style={styles.stage}>
        <Animated.View style={[styles.halo, { transform: [{ rotate: haloRotate }] }]}>
          <LinearGradient
            colors={[colors.accent, "transparent", colors.primary, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.haloGradient}
          />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.pulseRing, pulseStyle]} />
        <Animated.View style={cardStyle}>
          <View style={styles.portraitRing}>
            <Avatar
              name={current.name}
              avatarUrl={current.avatarUrl}
              size={Math.round(size * PORTRAIT_RATIO)}
            />
          </View>
        </Animated.View>
      </View>
      <Text style={styles.nameLabel} numberOfLines={2} ellipsizeMode="tail">
        {displayCharacterName(current.name)}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors, haloSize: number) {
  const ringSize = Math.round(haloSize * RING_RATIO);
  return StyleSheet.create({
    carousel: { alignItems: "center", marginBottom: 12 },
    stage: {
      width: haloSize,
      height: haloSize,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    halo: {
      position: "absolute",
      width: haloSize,
      height: haloSize,
      borderRadius: haloSize / 2,
      overflow: "hidden",
      opacity: 0.55,
    },
    haloGradient: { flex: 1 },
    pulseRing: {
      position: "absolute",
      width: ringSize,
      height: ringSize,
      borderRadius: ringSize / 2,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    portraitRing: {
      width: ringSize,
      height: ringSize,
      borderRadius: ringSize / 2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: colors.accent,
      backgroundColor: colors.background,
    },
    nameLabel: {
      fontFamily: serif,
      fontSize: 20,
      fontWeight: "500",
      color: colors.text,
      textAlign: "center",
      width: 230,
      minHeight: 46,
    },
  });
}
