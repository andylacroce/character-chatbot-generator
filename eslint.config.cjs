// eslint-config-next ships its own flat-config array (react, react-hooks, jsx-a11y,
// @next/next, and TypeScript parser/plugin wiring bundled in) — spread it in rather than
// hand-rolling those plugins ourselves. It registers the "@typescript-eslint" plugin
// namespace for .ts/.tsx files but doesn't turn on its recommended ruleset, so that's
// still layered on below, along with this repo's own rule tweaks.
const nextConfig = require("eslint-config-next");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const jsdocPlugin = require("eslint-plugin-jsdoc");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".next/**",
      "coverage/**",
      "tmp/**",
      "jest.setup.js",
      "scripts/**",
      "**/*.sh",
    ],
  },
  ...nextConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.test.{ts,tsx,js,jsx}", "tests/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },
  {
    files: ["**/*.cjs", "**/*.config.{js,cjs}", "jest.*.{js,cjs}", "scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  // Documentation standard (see CLAUDE.md's "Code documentation standard" section):
  // every top-level function/component/hook in the app/src/API layers carries a
  // one-line JSDoc summary, checked for correct JSDoc syntax and consumed by
  // `npm run docs:code` (TypeDoc) to generate a browsable reference. Deliberately
  // scoped to top-level declarations only (not nested/inline callbacks) and to
  // "does a doc block exist with a real description", not exhaustive @param/@returns
  // prose — this repo's inline "why" comments (see the root CLAUDE.md) stay the
  // primary form of in-code documentation; this layer is about the public API
  // surface being discoverable, not about re-explaining every parameter.
  {
    files: ["app/components/**/*.{ts,tsx}", "src/**/*.ts", "pages/api/**/*.ts"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
    plugins: { jsdoc: jsdocPlugin },
    rules: {
      ...jsdocPlugin.configs["flat/recommended-typescript-flavor"].rules,
      "jsdoc/require-jsdoc": [
        "warn",
        {
          contexts: [
            "Program > FunctionDeclaration",
            "Program > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
            "Program > VariableDeclaration > VariableDeclarator > FunctionExpression",
            "Program > ExportNamedDeclaration > FunctionDeclaration",
            "Program > ExportDefaultDeclaration > FunctionDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": ["warn", { contexts: ["any"] }],
      // Types already live in TS signatures and props interfaces; requiring prose
      // for every parameter/return/property on top of that duplicates information
      // and fights this repo's "don't explain what, only non-obvious why"
      // preference — the standard here is a one-line summary, not exhaustive
      // per-param bureaucracy.
      "jsdoc/require-param": "off",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-param-name": "off",
      "jsdoc/require-param-type": "off",
      "jsdoc/check-param-names": "off",
      "jsdoc/require-property": "off",
      "jsdoc/require-property-description": "off",
      "jsdoc/require-property-type": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-returns-type": "off",
      "jsdoc/require-throws-type": "off",
      "jsdoc/no-defaults": "off",
      // `@swagger` (swagger-jsdoc's OpenAPI annotation, see CLAUDE.md's "API
      // documentation" section) and `@google-cloud` aren't in jsdoc's default tag
      // dictionary but are pre-existing, legitimate conventions in this repo.
      "jsdoc/check-tag-names": ["warn", { definedTags: ["swagger", "google-cloud"] }],
      // Conflicts with this repo's established @module-header style (a blank line
      // between the summary and the @module tag for readability) and with
      // @swagger blocks' own blank-line-separated sections — both predate this
      // config and aren't worth reformatting for a purely cosmetic rule.
      "jsdoc/tag-lines": "off",
      // Fires on legitimate prose mentioning things like package scopes
      // (`@anthropic-ai/sdk`) as false positives.
      "jsdoc/escape-inline-tags": "off",
    },
  },
];
