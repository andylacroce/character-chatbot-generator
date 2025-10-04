module.exports = {
  extends: [
    "next",
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
  ],
  plugins: ["@typescript-eslint", "react"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
    // project: ["./tsconfig.json"], // Uncomment if you use rules requiring type information
  },
  settings: {
    react: {
      version: "detect",
    },
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    "coverage/",
    "tmp/",
    "jest.setup.js", // Exclude Jest setup file from linting
    "scripts/**",
    "**/*.sh",
  ],
  overrides: [
    {
      files: ["**/*.test.{ts,tsx,js,jsx}", "tests/**", "tests/**/**"],
      rules: {
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/ban-ts-comment": "warn",
        // Allow require-style imports in tests for legacy mocks
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-var-requires": "off",
        // Allow unused vars that start with underscore (common test pattern)
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
        "@typescript-eslint/no-this-alias": "warn",
        "@typescript-eslint/no-unused-expressions": "warn"
      }
    },
    {
      files: ["**/*.cjs", "**/*.config.js", "jest.*", "scripts/**"],
      rules: {
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-var-requires": "off"
      }
    },
    {
      files: ["**/*.d.ts"],
      rules: {
        "@typescript-eslint/triple-slash-reference": "off"
      }
    }
  ],
  rules: {
    // Add or override rules here as needed
    "react/react-in-jsx-scope": "off", // Next.js doesn't require React in scope
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "react/prop-types": "off",
  },
};
