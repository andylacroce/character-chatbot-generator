# AGENTS.md

Repository instructions for Codex and other agents that support the `AGENTS.md`
convention. These instructions apply to the entire repository unless a more specific
`AGENTS.md` or `AGENTS.override.md` exists below the working directory.

## Start here

Portrayal is a Next.js 16, React 19, and TypeScript application for creating and
chatting with historical, mythological, literary, and original characters. It uses a
hybrid routing architecture:

- `src/app/` contains App Router pages, UI components, hooks, and CSS modules.
- `src/pages/api/` contains the authoritative Pages Router API handlers. Do not migrate
  these to App Router route handlers as incidental cleanup.
- `src/` contains shared configuration, database, types, and utilities.
- `tests/` mirrors the source tree and uses Jest plus Testing Library.
- `proxy.ts` is the central API-origin and API-key security boundary.

Before editing, inspect `git status`, the relevant implementation, and its nearby
tests. Preserve user changes and unrelated worktree modifications.

## Documentation map

Use pointers instead of duplicating long explanations here:

- [`README.md`](README.md): product overview, setup, environment variables, feature
  behavior, storage, and troubleshooting.
- [`CLAUDE.md`](CLAUDE.md): detailed architecture and the historical reasons behind
  non-obvious behavior. Despite the filename, this is the canonical deep technical
  handbook for all agents. Read the relevant section before changing a core flow.
- [`CHANGELOG.md`](CHANGELOG.md): user-visible release history.
- [`package.json`](package.json): authoritative commands and dependency versions.
- [`src/db/schema.ts`](src/db/schema.ts): database schema and persistence contracts.
- [`jest.config.cjs`](jest.config.cjs): test discovery and the global 80% coverage gate.
- [`eslint.config.cjs`](eslint.config.cjs): lint, logging, and JSDoc enforcement.
- [`.github/pull_request_template.md`](.github/pull_request_template.md): final review
  checklist for logging, docs, database changes, and release notes.

When changing Next.js behavior, first read the relevant bundled guide under
`node_modules/next/dist/docs/`. This repository intentionally uses a newer Next.js
version whose behavior may differ from remembered conventions.

## Commands

Run commands from the repository root with npm.

```powershell
npm install
npm run dev
npm run build
npm run lint
npm run lint:md
npm run type-check
npm run test
npm run test:coverage
npm run docs:api
npm run docs:code
npm run db:check
npm run ci
```

For a focused test, disable repository-wide coverage collection so unrelated files do
not make an otherwise passing single suite fail:

```powershell
npx jest --runInBand --coverage=false tests/path/to/file.test.tsx
```

Use the narrowest useful checks while iterating. For a substantial or PR-ready change,
run `npm run ci`; it formats the tree before linting, type-checking, checking the live
schema, generating docs, testing with coverage, and building. Inspect the worktree after
it runs because its format step writes files.

## Architectural invariants

- Client-to-server requests go through `authenticatedFetch()` in `src/utils/api.ts`,
  not raw `fetch`, so proxy authentication and test mocking remain consistent.
- All Anthropic calls use the singleton in `src/utils/anthropicClient.ts`; model choice
  goes through `src/utils/claudeModelSelector.ts`.
- Chat streaming uses SSE frames shaped as `data: JSON\n\n`. Coordinate changes to the
  final payload with `useChatController.ts` and stream-parsing tests.
- Guest use must continue to work without optional account/database configuration.
  Features backed by Neon, OAuth, Blob, Redis, or email must degrade gracefully when
  their environment variables are absent.
- Keep shared character data separate from original-character or user-private data.
  Read the relevant `CLAUDE.md` sections before changing validation, persistence,
  avatar caching, the Character Wall, or copyright-override behavior.
- Use the helpers in `src/utils/storage.ts` and keys in `storageKeys.ts`; do not write
  versioned local-storage shapes directly or store secrets/PII client-side.
- Keep the shared `AppHeader` and `useAccountMenu` patterns consistent across pages.
- `package.json` intentionally has no `"type": "module"`. Do not add it; serverless API
  output relies on the current CommonJS-compatible package boundary.

## API, security, and data changes

- Treat `proxy.ts` as CSRF/origin protection, not user authentication. Preserve exact
  host matching, constant-time secret comparison, per-route rate limits, and route-level
  authorization where required.
- Validate and sanitize untrusted input with the utilities in `src/utils/security.ts`.
  Do not expose raw third-party error details to clients.
- Every new or changed API route needs an accurate `@swagger` JSDoc block. Regenerate
  with `npm run docs:api`; never hand-edit `public/openapi.json`.
- API failure paths and meaningful lifecycle events use
  `logEvent(level, event, message, meta)` from `src/utils/logger.ts`. Event names are
  stable, domain-prefixed `snake_case`. Do not add raw `console.*` or
  `logger.info`/`warn`/`error` calls.
- Never print or commit `.env.local`, credentials, tokens, connection strings, or
  generated service-account material. Use `.env.example` for documented placeholders.
- `npm run db:check` is read-only. Treat `npm run db:push`, reclassification, backfill,
  scrub, and other maintenance scripts as state-changing operations: run them only when
  the user explicitly puts that data or environment in scope and the target is verified.

## Implementation conventions

- Make the smallest coherent change and follow the style of neighboring code.
- Prefer existing utilities and components over parallel abstractions or dependencies.
- Add no production dependency unless it materially improves the requested solution.
- Keep TypeScript types explicit at public boundaries; avoid `any` and unchecked casts.
- Add a one-sentence `/** ... */` JSDoc summary immediately above every new top-level
  function, component, or hook under `src/app/components/`, `src/`, and `src/pages/api/`.
  Parameters and return tags are optional unless they clarify a non-obvious contract.
- Inline comments should explain constraints or reasoning, not restate the code.
- Preserve accessibility: semantic controls, keyboard operation, visible focus,
  descriptive labels, reduced-motion support, and usable phone layouts.
- Component styling belongs in `src/app/components/styles/*.module.css`; shared color/font
  tokens are authored in `packages/shared/src/tokens/{light,dark,fonts}.json` and consumed
  in `src/app/globals.css` via the generated `src/app/theme-tokens.generated.css`
  (`npm run theme:generate`) — never hand-edit a hex value in `globals.css` or the
  generated file directly. Verify light and dark modes when a change uses theme colors.
- Do not hand-edit generated output in `.next/`, `coverage/`, `docs-generated/`, or
  `public/openapi.json`.

## Tests and completion

- Add or update tests with behavior changes. Mock Anthropic, Google Cloud, image
  providers, email, and other external services; tests must not make live paid calls.
- Mock `authenticatedFetch`, not raw `fetch`, in client/server interaction tests.
- TTS tests must call `tts.__resetSingletonsForTest()` to prevent singleton leakage.
- Diagnose failures instead of weakening assertions or coverage thresholds.
- Before handoff, review the diff for accidental generated files and unrelated edits.
  Report the checks actually run and any check that could not run.
- For user-visible features or fixes, decide deliberately whether `README.md`,
  `CLAUDE.md`, and the current `CHANGELOG.md` section need updates. For architectural
  changes, update the deep technical handbook rather than leaving stale guidance.

## Code review rules

When asked to review, prioritize correctness, security, data loss, regressions, and
missing tests. Cite concrete files and lines. Pay particular attention to:

- authentication versus origin validation;
- fail-open versus fail-closed behavior in validation and game-token flows;
- guest-mode regressions caused by optional services;
- cache/persistence leaks involving original or blocked characters;
- SSE response compatibility and TTS's required text-only fallback;
- mobile, keyboard, and dark-mode regressions in shared UI.
