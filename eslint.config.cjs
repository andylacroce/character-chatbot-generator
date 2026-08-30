// eslint-config-next ships its own flat-config array (react, react-hooks, jsx-a11y,
// @next/next, and TypeScript parser/plugin wiring bundled in) — spread it in rather than
// hand-rolling those plugins ourselves. It registers the "@typescript-eslint" plugin
// namespace for .ts/.tsx files but doesn't turn on its recommended ruleset, so that's
// still layered on below, along with this repo's own rule tweaks.
const nextConfig = require('eslint-config-next');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      'tmp/**',
      'jest.setup.js',
      'scripts/**',
      '**/*.sh',
    ],
  },
  ...nextConfig,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', 'tests/**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  },
  {
    files: ['**/*.cjs', '**/*.config.{js,cjs}', 'jest.*.{js,cjs}', 'scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
];
