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
  preset: "ts-jest",
  testEnvironment: "jest-environment-jsdom",
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "ts-jest",
  },
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "^@/(.*)$": "<rootDir>/$1", // Fixes path alias resolution
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(lodash-es)/)", // Ensures Jest doesn't ignore ES modules that need transpiling
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"], // Ensure test setup is loaded
  testMatch: [
    "<rootDir>/tests/**/*.test.(ts|tsx|js|jsx)",
    "<rootDir>/**/__tests__/**/*.(ts|tsx|js|jsx)",
  ],
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/"],
  verbose: true,
  collectCoverage: true, // Enable coverage reports
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
