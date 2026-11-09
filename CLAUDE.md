# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm install              # install deps
npm run dev               # next dev --turbopack
npm run build              # production build
npm run lint                # eslint . --ext .js,.jsx,.ts,.tsx (includes JSDoc, security, and regex-safety rules)
npm run lint:fix
npm run lint:md              # markdownlint over **/*.md
npm run format                # prettier --write . (excludes *.md — markdownlint owns that)
npm run format:check           # prettier --check .
npm run type-check               # tsc --noEmit
npm run docs:code                 # typedoc -> docs-generated/ (gitignored); see "Code documentation standard"
npm run check                      # fast inner loop: lint + type-check + jest --onlyChanged (not a substitute for ci)
npm run test                       # jest
npm run test:watch
npm run e2e                          # Playwright smoke synthetics against `next start` (needs a prior build); zero Claude calls, see "Testing conventions"
npm run test:coverage               # jest --coverage (enforces 80% global threshold — see jest.config.cjs)
npm run analyze                      # ANALYZE=true next build (bundle analysis)
npm run sim:games                    # LLM-vs-game simulator (scripts/simulate-games.ts); spends real Anthropic tokens, see "Game simulator"
npm run docs:api                      # regenerate public/openapi.json from @swagger JSDoc comments; runs automatically before dev/build
npm run db:check                       # read-only check that schema.ts matches the live DB; runs automatically before dev and as part of ci
npm run ci                             # format (auto-fix) && lint --max-warnings=0 && lint:md && type-check && mobile ci && shared tests && db:check && docs:code && test:coverage && build && e2e — run this before considering work done
```

Run a single test file: `npx jest tests/api/chat.test.ts`. Run tests matching a name: `npx jest -t "some test description"`.
Coverage is enforced globally at 80% in `jest.config.cjs`.

- **`npm run ci` runs `format` (auto `--write`) first, not `format:check`,** so every later step runs
  against already-formatted code and can't fail on formatting after a long run.
  `.github/workflows/ci.yml` uses `format:check` first instead (fail fast; a workflow can't push a
  fix back). The pre-commit hook (`.githooks/pre-commit`, wired via `npm run prepare`) auto-formats
  staged files, so drift ideally never reaches either.
- **Workflow setup is the shared composite action `.github/actions/setup`** (Node 24, `node_modules`
  cached by a hash of the lockfile and every package.json so `npm ci` runs only when one changes); new jobs should use it.
- **Any step added to a `ci` script must also be added to the matching workflow;** the workflows
  list steps one by one rather than calling `npm run ci`. Workflows, required checks, the
  Dependabot/Expo upgrade flow, and the `EXPO_UPGRADE_TOKEN` secret are in `.github/CONTRIBUTING.md`.
- **Tool configs that needn't sit at the repo root live in `config/`** (TypeDoc, Drizzle,
  markdownlint; npm scripts pass `--config`/`--options`). Prettier's config is the `"prettier"` key
  in `package.json`. Jest's setup and node-module mocks live in `tests/` (`tests/setup.js`,
  `tests/__mocks__/`). There is no PostCSS config (Next's default already runs autoprefixer).
  The GCP key is never a file: it's inline JSON in `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

## Versioning

Git tags (`vX.Y.Z`, matching `package.json`'s `version`) mark shipped points so a regression can
be bisected against a known-good release. Tagging began 2026-09-22; never back-tag earlier history.

- **PATCH:** bug fixes, refactors, internal cleanup (no new user-visible capability).
  **MINOR:** a new user-facing feature or behavior change. **MAJOR:** essentially never; only for
  a break needing manual action from anyone depending on this app, and only by explicit agreement.
- **Docs-only or pure-chore commits (wording, comments, a no-behavior dependency bump) get no bump
  or tag.**
- **Tag only at a "ship it" moment** (see the global git workflow rule in `~/.claude/CLAUDE.md`)
  that ships a real change, never speculatively or mid-task. Mechanics:
  1. `npm run ci` is already green.
  2. Choose patch vs. minor, then `npm version patch --no-git-tag-version` (or `minor`); the flag
     folds the bump into the normal commit.
  3. Head the shipped `CHANGELOG.md` entry with the version, e.g. `## v0.6.0 — 2026-09-22 — Title`.
  4. Commit the bump and changelog entry with the change, on a feature branch, and ship it as a PR.
- **`main` is protected: every change, tagged or not, is a branch plus a PR,** merged once checks
  are green. Never push to `main`, and never tag locally or use `--follow-tags`: a tag pushed
  before the PR merges points at a commit that isn't on `main` (a squash-merge has a different SHA),
  and the workflow then skips it. `.github/workflows/tag-release.yml` creates the annotated
  `v<package.json version>` tag on every push to `main` if missing, so the merge itself tags the
  release. If a stray tag ever exists, delete it and re-run that workflow.

## Web/mobile parity (standing goal)

Keep the web app and the mobile app (`apps/mobile`) sharing as much as possible and in sync with
**every commit**. Logic, copy, types, and client state machines live once in `packages/shared`
(`character-chatbot-shared`, which web imports directly via `next.config.mjs`'s
`transpilePackages`); each platform supplies only a thin adapter: its own request transport,
storage, and logging. The guessing game is the model: `useGameSession` and `game*.ts` (`gameDefinitions`, `gameState`, `gameTransport`) in shared,
wrapped by `src/app/components/game/useGameController.ts` (SSE progress, localStorage) and
`apps/mobile/src/useGameController.ts` (plain JSON, AsyncStorage). For every change, ship the
other platform's side in the same commit, and move logic that exists on both sides into shared
rather than editing two copies. Mobile diverges only where it has to (React Native's fetch can't
read an SSE stream; Android keyboard handling) or where native features genuinely improve mobile
UX (haptics). A feature that exists on one platform only is a parity gap to call out, not a
default. Mobile-specific notes are in "Mobile app" below.

Human-oriented onboarding lives in `docs/` (`getting-started.md`, `architecture.md`, `features.md`,
`configuration.md`); keep them current alongside the rules when a flow or folder moves.

## Topic rules (`.claude/rules/`)

Feature and convention detail lives in path-scoped rule files that auto-load when matching files are
read. If a task starts from a description rather than a file, read the matching rule first:
`chat-tts` (chat, SSE, TTS, voices), `avatar`, `moderation` (validation, allow/blocklist, supported
gate), `account` (auth, DB, bots, messages, deletion), `character-wall`, `voice-input`,
`client-state-greeting`, `header` (AppHeader, landing carousel), `games` (engine, token, round flow), `game-judging` (classifier, replies, persona), `game-content` (curated names, rate limits), `game-modes` (Guess Who, Next, leaderboard), `game-simulator`,
`analytics` (/admin), `prompts`, `logging`, `docs-conventions` (JSDoc, OpenAPI), `testing` (incl. e2e),
`mobile`. Keep a rule current when you change the behavior it documents.

## Architecture

### Request flow

`src/app/components/chat/useChatController.ts` → `authenticatedFetch()` (`src/utils/api.ts`) →
`src/pages/api/chat.ts`. Every client→server call goes through `authenticatedFetch`, not raw
`fetch`, so it passes through `proxy.ts` auth and tests can mock it consistently.

`proxy.ts` is the single choke point for API auth: it validates request origin (localhost, Vercel
production/preview auto-pass) and enforces a constant-time-compared `x-api-key` against
`API_SECRET` for external origins. A new deployment domain means updating `allowedHosts` in
`proxy.ts` and nowhere else. Host matching is exact (never prefix/substring), and a request with no
`Origin`/`Referer` passes only on a safe method (GET/HEAD/OPTIONS) from a first-party host;
everything else needs the API key. `tests/proxy.test.ts` pins both directions. The Origin/Referer
check is real CSRF protection against a browser but not authentication against a non-browser
client (see "Security posture").

### Model selection (`src/utils/claude/claudeModelSelector.ts`)

Three tiers, chosen by call site, never by a runtime cost heuristic:

- `"text"`: chat replies only. `claude-sonnet-5-5` in prod, `claude-haiku-5-5` in dev.
- `"text-simple"`: one-shot structured JSON tasks (personality generation, character validation,
  voice config, suggestion lists, and the games' short verdict reactions). Always
  `claude-haiku-5-5`.
- Both 5.5 models think by default, which would eat the small `max_tokens` caps, so every call site
  passes `thinking: thinkingFor(tier)` (`src/utils/claude/claudeThinking.ts`): `between_tools` for Sonnet 5.5
  (it 400s on `disabled`), `disabled` for Haiku 5.5.
- `"image"`: avatar prompts render via `gemini-3.1-flash-lite-image` on Google Cloud's Gemini
  Enterprise Agent Platform (formerly Vertex AI; not Claude).

All Claude calls go through the singleton client in `src/utils/claude/anthropicClient.ts`.

### Rate limiting

`createRateLimiter({ name, max, message, windowMs? })` in `src/utils/server/rateLimit.ts` wraps every limited route. `name` is required and namespaces the counter (`rl:<name>:<ip>`) — a shared store is shared across routes, so without it `/api/chat` and `/api/audio` would draw down the same budget. With no Redis env vars configured the limiter uses `express-rate-limit`'s in-process MemoryStore, which is correct for local dev and per-instance on Vercel; with them set, `src/utils/server/rateLimitStore.ts` backs it with an Upstash-compatible Redis REST store and the limits become global. Store outages fail open (`passOnStoreError`) — the limiter throttles, `proxy.ts` authenticates.

### Module system (do not regress)

`package.json` intentionally has no `"type": "module"`: removing it once caused a Vercel
`ERR_REQUIRE_ESM` crash, because Next's CJS serverless launcher couldn't `require()` compiled API
route output. `next.config.mjs` uses an explicit `.mjs` extension so it's still ESM. Source
(TS, `import`/`export`) compiles fine either way via SWC; don't re-add `"type": "module"`.

## Security posture

Kept high-level (this file is public): what changed and why, not exploit-level specifics.

- **`proxy.ts`'s Origin/Referer check is CSRF protection, not authentication.** It stops a malicious
  site's browser JS from riding a visitor's session, but a non-browser client can set any `Origin`.
  Don't treat an allowed-origin match as proof of a trusted caller when reasoning about request
  volume or cost; the per-route rate limiter (`src/utils/server/rateLimit.ts`) is the real ceiling. Fully
  closing this would mean requiring login on guest-usable routes (breaking core UX) or real
  session/token infrastructure, an accepted tradeoff.
- **API key comparison is constant-time** (`secureCompare`, hash-then-`timingSafeEqual`), since Proxy
  defaults to the Node.js runtime in Next.js 16 (renamed from `middleware.ts`, which was Edge).
- **`getClientIp()`** trusts the first `x-forwarded-for` entry, correct on Vercel (its edge
  overwrites the header). Revisit if self-hosted behind another proxy (prefer `@vercel/functions`'
  `ipAddress()`).
- **`/api/health` is rate-limited (10/min/IP) and returns no raw third-party SDK error text** (still
  logged server-side); it makes two real billed or quota-limited calls per request.
- **`buildSsml()`** (`src/utils/chat/voiceHelpers.ts`) XML-escapes `text` before interpolating into SSML
  (also fixes malformed SSML from ordinary `&`/`<`). `/api/audio`'s `text` param is capped at 2000
  characters. Letting the client supply the text is intentional: audio isn't persisted server-side,
  so regenerating after eviction needs the original text.
- **`scripts/scan-secrets.sh`** matches this app's credential shapes (Anthropic keys, Google OAuth
  secrets, Postgres URLs, Vercel Blob tokens), not just PEM blocks; `.env.example` is excluded
  (placeholders look like credentials by design).
- **`.github/workflows/semgrep.yml`** runs the JavaScript, TypeScript, React, and Node.js community
  rulesets on pushes to `main` and PRs (token-free `semgrep scan`, metrics off); reviewed false
  positives carry narrow `nosemgrep` annotations with reasons.
- **`eslint-plugin-regexp`** runs `no-super-linear-backtracking` and `no-super-linear-move` as
  errors in `npm run lint`, catching ReDoS-shaped patterns locally.
- **`.github/workflows/ci.yml` uses `npm ci`,** not `npm install`/`update`, for reproducible builds.
- **`next.config.mjs`** sends explicit `Strict-Transport-Security` alongside the CSP,
  `X-Frame-Options`, and `Permissions-Policy` headers.
- **Anyone integrating with the API key** gets the current `API_SECRET` from `.env.local`/Vercel.

## Environment variables

**Required:** `ANTHROPIC_API_KEY`, `API_SECRET` (checked by `proxy.ts`),
`GOOGLE_APPLICATION_CREDENTIALS_JSON` (inline service-account JSON, for TTS; in `.env.local` keep it on one line in single quotes, since dotenv expands escapes in double quotes and corrupts the private key).

**Optional** (each degrades gracefully when unset; the app is fully functional as a guest with none):

- `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`: overrides the production site's built-in GA4 stream or enables
  the consent-gated flow in development (see "Internal analytics").
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`: Cloudflare Workers AI as the primary avatar
  provider; without them Pollinations.ai runs with no config (see "Avatar generation").
- `VERCEL_BLOB_READ_WRITE_TOKEN` / `BLOB_READ_WRITE_TOKEN`: Vercel Blob logging and durable avatar URLs.
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`):
  share rate-limit counters across instances.
- `DATABASE_URL` + `NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`: account sign-in
  and persistence (see "Account persistence").
- `EMAIL_SERVER` + `EMAIL_FROM`: passwordless magic-link sign-in alongside Google (needs `DATABASE_URL`).
- `GAME_TOKEN_SECRET`: key for the games' encrypted round token; falls back to `NEXTAUTH_SECRET`, then
  the required `API_SECRET`, so the games need no new configuration.
- `ADMIN_EMAILS`: comma-separated allowlist for `/admin`; fails closed when unset.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
