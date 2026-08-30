/**
 * @fileoverview Jest configuration for testing the Character Chatbot Generator application.
 * This file configures Jest to properly handle Next.js, TypeScript, and CSS modules.
 *
 * @see {@link https://jestjs.io/docs/configuration}
 * @see {@link https://nextjs.org/docs/testing#jest-and-react-testing-library}
 */

const nextJest = require("next/jest");

/**
 * Create a Jest configuration with Next.js defaults
 * This provides automatic transforms and module mocks for Next.js
 */
const createJestConfig = nextJest({
  dir: "./",
});

/**
 * Custom Jest configuration with specific settings for the Character Chatbot Generator
 * @type {import('jest').Config}
 */
const customJestConfig = {
  testEnvironment: "jest-environment-jsdom",
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { "configFile": "./babel-jest.config.js" }],
  },
  moduleNameMapper: {
    // CSS/SCSS/SASS imports are already handled by next/jest's own mocks
    // (object-proxy.js for .module.css, styleMock.js otherwise), applied
    // before this config is spread in — an explicit mapping here would
    // never be reached.
    "^@/(.*)$": "<rootDir>/$1", // Fixes path alias resolution
  },
  // By default Jest ignores transforming files in node_modules. Newer dependencies (ESM
  // packages like `uuid@13`) ship `export` syntax and must be transformed by Babel for
  // Jest to parse them. The pattern below whitelists specific packages while keeping
  // the default behavior for others. It handles both POSIX and Windows path separators.
  transformIgnorePatterns: [
    "node_modules[/\\\\]?(?!(lodash-es|uuid)(?:[/\\\\]|$))",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"], // Ensure test setup is loaded
  testMatch: [
    "<rootDir>/tests/**/*.test.(ts|tsx|js|jsx)",
    "<rootDir>/**/__tests__/**/*.(ts|tsx|js|jsx)",
  ],
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/"],
  verbose: true,
  collectCoverage: true, // Enable coverage reports
  // Without this, coverage is only measured over files some test happens to import,
  // so an entirely untested module (proxy.ts once was one) costs nothing against the
  // threshold below. Enumerate the shipped source instead so the percentage is
  // measured against the real denominator.
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "pages/**/*.{ts,tsx}",
    "src/**/*.{ts,tsx}",
    "proxy.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Speed optimization settings
  cache: true,
  cacheDirectory: "<rootDir>/.jest-cache",
  maxWorkers: "50%",
};

module.exports = createJestConfig(customJestConfig);
