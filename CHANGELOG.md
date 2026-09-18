# Changelog

This changelog was backfilled from the project's git history on 2026-09-12. It reads as curated highlights of what shipped and why, not an exhaustive commit-by-commit log — routine dependency bumps, formatting/lint fixes, and small iterative churn are omitted or collapsed. Dates are calendar dates commits landed; the project has no version tags, so sections are grouped by date range instead.

## 2026-09-17 to 2026-09-18 — Guessing game (chain mode), copyright/trademark moderation, and observability

- Added a "guess who" chain game (`/game`) as a second mode alongside ordinary chat: chat with a real, named character who naturally steers the conversation toward a different, hidden figure; guesses are typed into the same chat box (no separate guess control) and classified server-side on every turn. A correct guess promotes the hidden figure to be the new chat partner, continuing the chain and building a streak; a second wrong guess (or a voluntary give-up, with an in-app confirmation) ends the run and always reveals the answer.
- `app/components/ChatShell.tsx` extracted the shared chat-screen UI (header, transcript, input, audio controls) out of `ChatPage.tsx`; both the game and ordinary chat now render through the same shell instead of two independently-drifting copies.
- Fixed a real hang found in dev: `pollinationsImageGen.ts`/`cloudflareImageGen.ts`'s avatar-image `fetch()` calls had no timeout, so a stalled free/anonymous provider could hang avatar generation (and anything that calls it, like the game's round-start) indefinitely instead of degrading gracefully. Both now carry a 25s `AbortSignal.timeout`.
- Fixed the game's staged "starting…" spinner wrapping back to its first message instead of holding on the last stage while a slow request was still in flight, which read as the request having silently restarted.
- **Guessing-game refinements found during further play-testing before merge:** fixed a real round-switch bug where `roundStartIndex` leaked a prior round's own tail (its guess/reaction/Q&A) into the next round's server-side conversation history from round 3 onward — only the very first round switch happened to compute the right value. A correct guess now holds on an explicit "Continue" button before switching partners instead of advancing instantly, so the reveal gets a deliberate beat. Players can also give up by typing it directly into the chat ("I give up") in addition to the menu's Give Up button, both funneling into the same confirmation dialog.
- Consolidated the app's header/identity UX: `useAccountMenu()` (identity label, change name, admin link, sign in/out) is now used by every page including chat and the game, sign-in/out always redirects to `/` and clears any stored bot session first, and a shared `BackHomeLink` pill replaced a couple of ad-hoc "back" links. Fixed a real bug where clicking a hamburger-menu item that opened a dialog (rather than navigating) never actually closed the dropdown, plus four independent CSS bugs found while auditing the hamburger's mobile positioning.
- **Character copyright/trademark moderation system:** added a permanent allow/block list (checked before any Claude call) plus an append-only warning log and an admin `/admin/moderation` page, closing a live bug where an already-public, already-cached character (Alice Munro) could pop a fresh copyright warning on a later launch. Hardened the classification prompt after a live sweep false-positived Sherlock Holmes/Thor/Winnie-the-Pooh as copyright violations. Added a second, narrower hard-block for a real living person with a well-documented serious criminal record (never applied to historical figures or ordinary celebrity controversy); blocking a name now scrubs it from every signed-in user's own saved characters too, not just the shared avatar cache.
- Automated Prettier formatting across the pipeline (a pre-commit hook plus an auto-fixing first step in `npm run ci`) so formatting drift can no longer surface only at the very end of a full CI run.
- **Observability:** fixed a real bug where the rate limiter's `rate_limit_exceeded` log was dead code on every actual 429 (the underlying library's default handler never called `next()`); added structured per-request logging (`withRequestLog`) to every API route, persisted to a gitignored, size-rotated `logs/dev.log` in dev; and gave that file its own NDJSON format (distinct from the human-readable terminal output) so it's forward-compatible with a real log pipeline (Kibana, Datadog, etc.) later without touching the logger again.

## 2026-09-08 to 2026-09-12 — Logging cleanup, admin hardening, personalized greetings

- Replaced the last paid dependency in avatar generation with two free, no-payment-required image providers: Cloudflare Workers AI (`flux-1-schnell`, 10,000 free "neurons"/day) tried first, falling back to Pollinations.ai's uncapped anonymous tier (#855).
- Lightened `/api/health` to check provider reachability instead of running a real, billed inference/synthesis call on every request.
- Adopted Prettier across the codebase and enforced it in CI; added a JSDoc + TypeDoc documentation standard (a one-line summary on every exported function/component/hook), enforced by ESLint.
- Added an internal, privacy-conscious usage-analytics log (three low-frequency events: character validated, avatar generated, bot created) and an admin-only `/admin` stats dashboard, gated by an `ADMIN_EMAILS` allowlist that fails closed and is disabled on Preview deployments; later redesigned with derived metrics and a live-refreshing "Updated" timestamp. `/admin` now 404s outright for a non-admin instead of rendering a stats shell (#860).
- A second security-hardening pass: constant-time API-key comparison in `proxy.ts`, no more raw third-party error text surfaced from `/api/health`, a capped/escaped `/api/audio` text parameter, updated secret-scanner patterns, and a rotated `API_SECRET`.
- Added magic-link (email) sign-in alongside Google (#859).
- Standardized every API route's logging onto one structured `logEvent(level, event, message, meta)` convention, closing gaps where a few newer routes had drifted onto ad-hoc `logger.info`/`.error` calls; now ESLint-enforced so it can't regress.
- Reframed landing copy and personality generation toward "edu-tainment."
- Added the personalized-greeting name-gate (ask the visitor's own name once, use it in the character's replies and transcript), a unified `AppHeader`/`useAccountMenu`/landing carousel shared across pages, and fuzzy character-name matching so a misspelling reuses an existing avatar instead of creating a duplicate cache entry (#861).
- Added a read-only DB schema-drift guardrail (`npm run db:check`) that fails loudly if `schema.ts` declares a column the live database doesn't have yet, plus a repo PR checklist.

## 2026-09-01 to 2026-09-07 — Rebrand to Portrayal, original characters

- Added an original-character flow: when Claude doesn't recognize a submitted name as a real character, a modal collects a personality/background description before generation instead of guessing from just a made-up name.
- Rebranded the app's UI as "Portrayal," with a new period-appropriate type system and an animated wordmark.
- "Chat with this character" (from the Character Wall or the landing carousel) now launches straight into a chat — resuming a signed-in user's saved bot, or generating fresh — instead of landing on the plain creator form; fixed a duplicate `/api/bots` request race and a cancel-flow bug where backing out of a character launch didn't fully unwind.

## 2026-08-25 to 2026-08-31 — Account persistence, the Character Wall, and an immersive redesign

The biggest stretch of the project since the original rewrite: optional, additive account persistence landed in phases, alongside a public character gallery and a full chat-page redesign.

- **Account persistence (#831), phased so guest usage keeps working unchanged:** generated avatars upload to Vercel Blob for a durable URL (phase 1); Auth.js (next-auth v4) with Google sign-in on a new Drizzle/Neon Postgres foundation (phase 2); an in-page sign-in lightbox on the landing page (phase 3a); a `bots` table that persists a signed-in user's created characters plus a shared, environment-agnostic `avatar_cache` (phase 3b); and server-persisted chat history with rolling conversation-summarization checkpoints, replacing full-history re-summarization every turn (phase 3c).
- Facebook sign-in was built and briefly shipped alongside Google (#833), then fully removed the same day after discovering Meta's Business-Portfolio verification requirement has no path for an individual developer without a registered business; account linking for Google/Facebook sharing an email was fixed in between (#834).
- Redesigned the chat page as an "immersive stage," including dark-mode contrast fixes (#835).
- Redesigned the landing page and color palette (earthy clay/deep teal) and added the Character Wall (`/chars`) — a public, no-auth gallery of every recognized character portrait generated so far.
- Repo cleanup (#836 and follow-ups): fixed 42 React `act()` warnings across 9 test files, removed dead code/assets and unused dependencies, deleted duplicate tests, and defaulted to light mode.

## 2026-08-18 to 2026-08-24 — Prompt-injection hardening and API docs

- Hardened chat prompts against injection with an explicit guard and clearer persona/summary tag wrapping.
- Closed API-auth bypasses and started measuring test coverage honestly; fixed an audio path-traversal guard and shared rate-limit counters properly across routes.
- Documented every API route with `@swagger` JSDoc and published an interactive `/reference` page (Scalar) generated from it.
- Added an explicit Content-Security-Policy header.

## 2026-08 (early) — Avatar generation moves to Gemini

- Migrated avatar generation from Google Vertex AI's Imagen to Gemini (later renamed Google Cloud's "Gemini Enterprise Agent Platform").
- Added guardrails against generating images that resemble real people or copyrighted character designs.

## 2026-06 to 2026-07 — Bug fixes and the project's first documentation

- Fixed a popup blocker, proxy auth, and transcript download bugs in one pass.
- Added the project's first `CLAUDE.md`, documenting architecture and commands for AI coding agents working in the repo.

## 2026-04 to 2026-05 — Character variety and quiet maintenance

- Expanded the random/fallback character list to 100 diverse names spanning mythology and literature, and tuned avatar-generation loading-message timing.
- Swapped a placeholder profile image for a real one on the about/attribution link.

## 2026-03 — Migrating from OpenAI to Claude

- Replaced the OpenAI-based chat, personality, and voice pipeline with Anthropic's Claude API end to end (#518) — the foundation of the model-tier architecture (`text`/`text-simple`/image) the app still uses.

## 2026-01 to 2026-02 — Small fixes between dependency updates

- Safer blob handling in the request-logging API; more diverse, creative random-character suggestions; graceful response wrapping added to the chat API.
- Routine dependency updates (ESLint, ts-jest, TypeScript tooling) otherwise dominated these two months.

## 2025-12 — Smart continuation, copyright validation, test hardening

- Added "smart continuation": detecting a truncated model reply, appending a "Would you like me to continue?" prompt, and resuming seamlessly — including an AI-based check for whether the user's next message was an affirmative "yes."
- Hardened the TTS output path (strict directory checks, filename sanitization) against path traversal.
- Added the copyright/trademark warning modal and the `/api/validate-character` classification endpoint — the root of today's warning/caution/blocked-name/original-character checks.
- Added a stop-audio button and an intro-loading state; switched image-model selection between `gpt-image-1` variants.
- Added markdownlint to CI and broadened test coverage across avatar generation, voice configuration, and the bot-creation flow.

## 2025-11 — Streaming replies, summarization, a real CI pipeline

- Added SSE streaming to the chat API.
- Added conversation summarization once history exceeds a length threshold — the predecessor of today's rolling-summary checkpoint system.
- Added the first GitHub Actions CI workflow covering lint, test, coverage, and build.
- Added an agent-instructions file for AI coding agents, an early ancestor of this repo's `CLAUDE.md`.

## 2025-10 — Security lockdown and public-domain defaults

- Added a disclaimer and switched default/random characters to public-domain figures — the first move toward today's copyright-validation flow.
- Enabled direct character launch via a `?name=` URL parameter, the same mechanism the Character Wall and landing carousel still use.
- Rewrote transcript export as an HTML download that includes the character's portrait.
- Shipped a "comprehensive API security" pass: rate limiting on chat and audio, input-sanitization utilities, and Vercel-preview-aware origin middleware — the direct predecessor of today's `proxy.ts`.
- Fixed mobile keyboard and scrolling behavior around the chat input.

## 2025-09 — Secret scanning and gender-aware voices

- Added a secret-scanning CI workflow (dropped once, then reinstated for good).
- Added gender parameters to the chat/audio APIs with a deterministic voice fallback.
- Added an avatar-generation timeout with elapsed-time display in the creation UI.

## 2025-07 to 2025-08 — Extracting hooks

- Split the growing `ChatPage` component into `useChatController`, `useBotCreation`, and a standalone `VirtualizedMessagesList` — the structure the app's client code still follows.
- Added a `getValidBotFromStorage` utility and fixed voice-configuration error handling.
- August was quiet otherwise: mostly dependency maintenance and standardizing API response/error handling across endpoints.

## 2025-06-23 to 2025-06-29 — Structured logging and origin-restricted APIs

- Rewrote logging across the app onto structured `logEvent`/`sanitizeLogMeta` calls.
- Added origin-restricted API access middleware — the direct ancestor of today's `proxy.ts`.
- Restyled dark mode and globals with a Material Design 3-inspired palette.

## 2025-06-12 to 2025-06-22 — Avatar and character refinements

- Added gender support to bot creation and voice configuration.
- Shipped the bot's self-introduction on creation (#36), fixed the initial audio message not stopping (#39), and improved logging (#41).
- Refined avatar-generation prompts and model-selection logic; expanded the random-character fallback list for diversity (#26).

## 2025-06-09 to 2025-06-11 — The pivot: from a Gandalf chatbot to a character generator

In a single marathon push, the single-character "Gandalf" chatbot became a general character generator — most of the app's current shape traces back to this window.

- Bot creation and personality generation, DALL-E avatar generation, per-character voice configuration, and a random-character button.
- Dark mode, a hamburger menu, and localStorage-based bot/session persistence.
- Chat message virtualization (`react-window`) and audio caching by content hash.
- A full Jest test suite covering the new surface.
- The project was renamed twice in the same window: first to "AI Character Chatbot," then to "Character Chatbot Generator."

## 2025-05 — Security hardening, new hooks, a UI overhaul

- A major mobile-responsive CSS pass across the whole chat interface.
- Hardened per-session request logging (XSS sanitization, IP validation, log-injection and path-traversal fixes) around writing session logs to Vercel Blob.
- Introduced the `useChatScrollAndFocus` hook and split components into dedicated CSS modules.
- Added, then partly walked back, internal request authentication between routes — an early precursor of today's `proxy.ts` origin/API-key check.
- Broadened test coverage across audio, health, logging, and transcript handling.

## 2025-04 — Jest, CI, and a smarter rate limiter

- Adopted Jest as the test framework and added the first GitHub Actions workflow to run it.
- Rebuilt the rate limiter with an in-memory cache fallback; fixed a CWE-78 shell-injection vulnerability in the test runner.
- Added reply caching and refined the chat persona prompt.
- A large CSS/responsiveness pass across the chat UI (audio toggle, layout, button styling).

## 2025-03 — Structured logging, audio reliability

- Rewrote logging to a structured, piped format and added retry/backoff for transient audio-file 403/404 errors (#19, "audio concurrency").
- Fixed several CodeQL "uncontrolled data used in path expression" alerts (#11, #16).
- Re-added and stabilized text-to-speech after an earlier rearchitecture; added Vercel Speed Insights (#17).

## 2025-01 to 2025-02 — Rate limiting, real TTS, a test suite

- Added a rate limiter and moved the OpenAI key handling behind it (#10).
- Rearchitected and re-added TTS with Google Cloud auth.
- Set up Jest and wrote the project's first real test suites (audio, cache/TTS utilities).
- Fixed a string of CodeQL path-expression alerts.

## 2024 — Model upgrades and dependency maintenance

- Upgraded the underlying chat model from GPT-3.5 to GPT-4 (January), then GPT-4o (June), then GPT-4-turbo with a larger response budget (July).
- A design overhaul and restyle (March).
- The rest of the year was mostly dependency/ESLint maintenance, with a round of styling fixes in December.

## 2023 — Origins: a single-character Gandalf chatbot

- Started 2023-11-16 as `my-gandalf-chatbot`: a single Next.js page chatting as Gandalf, styled with Bootstrap.
- Shipped fast in the first two days: conversation memory, disabling input while the bot responds, a response-length cap, hiding the API key, and basic chat-history styling.
- Added Vercel Speed Insights and a user disclaimer (December).
