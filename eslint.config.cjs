// eslint-config-next ships its own flat-config array (react, react-hooks, jsx-a11y,
// @next/next, and TypeScript parser/plugin wiring bundled in) — spread it in rather than
// hand-rolling those plugins ourselves. It registers the "@typescript-eslint" plugin
// namespace for .ts/.tsx files but doesn't turn on its recommended ruleset, so that's
// still layered on below, along with this repo's own rule tweaks.
const nextConfig = require("eslint-config-next");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const jsdocPlugin = require("eslint-plugin-jsdoc");
const regexpPlugin = require("eslint-plugin-regexp");
const securityPlugin = require("eslint-plugin-security");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".next/**",
      "coverage/**",
      "docs-generated/**",
      "tmp/**",
      "jest.setup.js",
      "scripts/**",
      "**/*.sh",
      // apps/mobile is a separate React Native/Expo app with its own eslint.config.js
      // (eslint-config-expo, not eslint-config-next) and its own npm run lint/ci —
      // this repo's web-focused rules (react/no-unescaped-entities, react-hooks/refs'
      // false positive on Animated.Value refs, etc.) don't apply to RN code.
      "apps/mobile/**",
    ],
  },
  ...nextConfig,
  {
    plugins: { regexp: regexpPlugin },
    rules: {
      // CodeQL caught a polynomial ReDoS in displayCharacterName() only after the
      // vulnerable code reached a PR. Keep this focused rule in the ordinary local
      // lint command so unsafe regex backtracking fails before code is pushed.
      "regexp/no-super-linear-backtracking": "error",
      // Unanchored regex searches can also become polynomial by retrying a linear
      // match at every input position. This is how the displayCharacterName() regex
      // was classified, so both protections are required to cover that regression.
      "regexp/no-super-linear-move": "error",
    },
  },
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
  // Logging standard (see CLAUDE.md's "Logging standards" section): every app/src/API
  // log line goes through src/utils/logger.ts, not a raw console call, so it's captured
  // by the same server-side (Winston) / client-side (browser) formatting either way.
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.ts", "pages/**/*.ts"],
    ignores: ["**/*.test.{ts,tsx}", "src/utils/logger.ts"],
    rules: {
      "no-console": "warn",
    },
  },
  // Within API routes specifically, every log call is a structured event (logEvent),
  // not a bare logger.info/warn/error — that's what gives every log line a stable,
  // greppable `event` name instead of a hand-formatted message string. src/utils/logger.ts
  // itself and its tests are exempt (they implement/exercise the `logger` object).
  {
    files: ["pages/api/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "CallExpression[callee.object.name='logger'][callee.property.name=/^(info|warn|error)$/]",
          message:
            "Use logEvent(level, event, message, meta) instead of logger.<level>() in API routes, so every log line carries a structured event name (see CLAUDE.md's Logging standards).",
        },
      ],
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
  // Local static-analysis security scan (see CLAUDE.md's "Security posture" section) —
  // catches unsafe patterns (eval, child_process with dynamic input, non-literal
  // fs/require paths, unsafe regex, etc.) at edit time and in this repo's existing
  // `npm run lint` gate, well before GitHub's own CodeQL scan ever runs (which only
  // fires after a push). Scoped to the same app/src/API layers as the jsdoc/logging
  // rules above — scripts/tests/config files are excluded, matching this file's
  // existing convention.
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.ts", "pages/**/*.ts"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { security: securityPlugin },
    rules: {
      ...securityPlugin.configs.recommended.rules,
      // Flags almost any dynamic property/array access (`obj[key]`) as a potential
      // prototype-pollution vector — the plugin's own docs note this rule is prone to
      // false positives, and this codebase's actual dynamic-key lookups (config maps,
      // parsed API responses) are all against known-shape objects, not
      // attacker-controlled keys. Disabled rather than warned-and-ignored, so a real
      // future finding from the other rules isn't lost in noise from this one.
      "security/detect-object-injection": "off",
      // Flagged 47 pre-existing, already-reviewed call sites in the TTS/audio-cache
      // subsystem (pages/api/audio.ts, chat.ts, src/utils/tts.ts, ttsReply.ts) — every
      // one builds its path from a hashed cache key run through sanitizeFilename()
      // (or, in audio.ts, an explicit escapesRoot()/realpathSync() traversal guard),
      // inside a fixed root (os.tmpdir()/public), never from raw request input. The
      // rule can't see past sanitizeFilename() to know that, so it flags the pattern
      // unconditionally. A real future case (an fs call built directly from
      // unsanitized user input) would still need the same manual review this one got.
      "security/detect-non-literal-fs-filename": "off",
    },
  },
];
