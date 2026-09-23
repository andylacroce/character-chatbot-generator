// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    settings: {
      // Explicit version skips eslint-plugin-react's auto-detection code
      // path, which crashes under ESLint 10 (it still calls the removed
      // legacy context.getFilename() API - see git history for the full
      // TypeError this works around).
      react: {
        version: "19.3.0",
      },
    },
    rules: {
      // eslint-config-expo bundles web-oriented React/JSX rules (via
      // eslint-plugin-react) that don't fit React Native's Text rendering:
      // there's no HTML entity concept in native string children, so its
      // suggested &quot;/&apos; "fixes" are nonsensical here, not real issues.
      "react/no-unescaped-entities": "off",
      // react-hooks/refs (React Compiler-era) flags any `.current`/method access
      // on a ref during render — but `const x = useRef(new Animated.Value(0)).current`
      // (and calling `.interpolate()` on it) is the standard, RN-documented way to
      // create a stable Animated.Value that survives re-renders. This isn't the
      // "read mutable ref state during render" bug the rule targets; it's a false
      // positive on every Animated.Value in the app. Off rather than rewritten,
      // since there's no compiler-safe equivalent RN itself recommends instead.
      "react-hooks/refs": "off",
    },
  },
]);
