---
paths:
  - "src/pages/api/**"
  - "src/app/api/**"
  - "scripts/generate-openapi.cjs"
  - "config/typedoc.mjs"
  - "eslint.config.cjs"
---

### Code documentation standard

A separate layer from inline "why" comments (default to none; add one only when the reasoning is
non-obvious): a one-line `/** ... */` JSDoc summary on every top-level exported function, React
component, and hook.

- **Required:** a real summary sentence placed immediately above the declaration (a blank line or
  statement between breaks the association). Not required: exhaustive `@param`/`@returns` prose
  (signatures already say it); add tags only when they carry a non-obvious contract.
- **Enforced** by `eslint.config.cjs`'s `eslint-plugin-jsdoc` block, scoped to
  `src/app/components/**/*.{ts,tsx}`, `src/**/*.ts`, and `src/pages/api/**/*.ts` (tests and `.d.ts`
  excluded). `jsdoc/require-jsdoc` matches by AST position (`Program > ...`), so both `export const
  Foo = () => {}` and `const Foo = () => {}; export default Foo` are covered, and
  `flat/recommended-typescript-flavor` validates syntax wherever a block exists. `@swagger` and
  `@google-cloud` are allowed via `check-tag-names`' `definedTags`. A missing or malformed block fails
  `npm run ci` (`--max-warnings=0`).
- **Exported** by `npm run docs:code` (TypeDoc, `config/typedoc.mjs`) to gitignored `docs-generated/`,
  also a `ci` step and a workflow step (a second check on the same comments). `blockTags` is TypeDoc's
  `OptionDefaults.blockTags` plus `@swagger`; the two tools keep separate tag allowlists.
- **Nested helpers and callbacks don't need blocks** (only top-level declarations; `eslint-plugin-jsdoc`
  additionally requires one on any nested `function`-keyword declaration, but arrow helpers are
  exempt). Don't document every inner helper.

### API documentation

Every `src/pages/api/*.ts` and `src/app/api/**/route.ts` handler carries an OpenAPI 3.0 `@swagger` JSDoc block.
`npm run docs:api` (`scripts/generate-openapi.cjs`, via `swagger-jsdoc`) writes
`public/openapi.json` (a gitignored build artifact; never hand-edit) and runs automatically before
`dev`/`build`/`vercel-build`. `src/app/reference/route.ts` serves the interactive UI
(`@scalar/nextjs-api-reference`) at `/reference` from that static file, since Vercel's bundler
doesn't reliably ship raw `.ts`; it sits outside `src/pages/api`, so `proxy.ts` auth doesn't apply.
The globs are recursive (`src/pages/api/**/*.ts` and `src/app/api/**/*.ts`) so nested directories like `admin/` are picked up,
and the script normalizes to forward slashes because `swagger-jsdoc` doesn't match backslash paths
(if `docs:api` reports 0 documented paths locally on Windows, suspect this).
