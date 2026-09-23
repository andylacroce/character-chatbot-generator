/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // The npm workspace hoists a different `react` to the repo root (for the Next.js web
  // app) than the exact version this app pins, so without this, app code (resolving
  // "react" from apps/mobile's own nested node_modules) and the test renderer
  // (resolving "react" from wherever jest-expo/@testing-library are hoisted to) end up
  // as two separate React module instances — surfaces as "Cannot read properties of
  // null (reading 'useState')" from a hook that's actually being called correctly.
  // Forcing every "react"/"react/jsx-runtime" require to this app's own installed copy
  // is the standard fix for a monorepo with a version-pinned React Native app.
  moduleNameMapper: {
    "^react$": require.resolve("react"),
    "^react/jsx-runtime$": require.resolve("react/jsx-runtime"),
    "^react/jsx-dev-runtime$": require.resolve("react/jsx-dev-runtime"),
  },
  // The reverse hoisting problem: packages hoisted to the repo root (@react-navigation/*)
  // peer-depend on native modules installed only under apps/mobile (react-native-screens,
  // react-native-safe-area-context), which Node resolution from the root can't see.
  // Falling back to this app's own node_modules lets them resolve.
  moduleDirectories: ["node_modules", "<rootDir>/node_modules"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  collectCoverage: true,
  // Enumerate the real source (not just what a test happens to import) so an
  // entirely untested file costs against the threshold below — same rationale
  // as the web app's own jest.config.cjs.
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "App.tsx", "!**/*.d.ts"],
  coverageDirectory: "<rootDir>/coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
