import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../ThemeContext";

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * "Portrayal" hero wordmark — mirrors BotCreator.module.css's .heroWordmark exactly:
 * a big, bold, continuously-glowing headline (bigger than the actual headline text
 * below it) with each letter flying/rotating in on mount, not a plain static label.
 */
export default function Wordmark({ text }: { text: string }) {
  const { colors } = useTheme();
  const glow = useRef(new Animated.Value(0)).current;
  const letterAnims = useRef(text.split("").map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const stagger = Animated.stagger(
      45,
      letterAnims.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: true }),
      ),
    );
    stagger.start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });

  return (
    <View style={styles.row}>
      {text.split("").map((ch, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.letter,
            { color: colors.primary },
            {
              opacity: letterAnims[i],
              transform: [
                {
                  translateY: letterAnims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
                {
                  rotate: letterAnims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: ["-6deg", "0deg"],
                  }),
                },
                { scale },
              ],
            },
          ]}
        >
          {ch}
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 6 },
  letter: {
    fontFamily: serif,
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
