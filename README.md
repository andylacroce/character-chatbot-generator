# Portrayal

[![License: Proprietary](https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg)](LICENSE)
[![CI](https://github.com/andylacroce/character-chatbot-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/andylacroce/character-chatbot-generator/actions/workflows/ci.yml)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-orange.svg)](#license--disclaimer)

**This app is in early beta.** Expect bugs and rough edges — see [License & Disclaimer](#license--disclaimer).

A Next.js 16 + TypeScript app for chatting with history's greatest minds, legendary heroes, and literary icons, with Claude-powered responses, factually-grounded personalities, and Google Text-to-Speech audio replies.

**[Live demo](https://character-chatbot-generator.vercel.app)**

## Table of Contents

- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [External Services & Accounts](#external-services--accounts)
- [Quickstart (Local Development)](#quickstart-local-development)
- [CI-Style Local Validation](#ci-style-local-validation)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Avatar Generation](#avatar-generation)
- [API Security](#api-security)
- [Account Persistence (Optional)](#account-persistence-optional)
- [Character Wall (`/chars`)](#character-wall-chars)
- [Guessing Game (`/game`)](#guessing-game-game)
- [Personalized Greeting](#personalized-greeting)
- [Internal Analytics (`/admin`)](#internal-analytics-admin)
- [Storage (Client-Side)](#storage-client-side)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License & Disclaimer](#license--disclaimer)
- [Agent Instructions](#agent-instructions)

## Key Features

- **Claude AI Integration**: Uses claude-sonnet-4-6 (production chat) / claude-haiku-4-5-20251001 (dev + simple tasks) with streaming responses and conversation summarization
- **Copyright Protection**: AI-powered character validation with copyright/trademark detection and public domain suggestions, backed by a permanent allow/block list and an admin-only `/admin/moderation` panel
- **Guessing Game**: A second mode at `/game` — chat with a named character who steers the conversation toward a different, hidden figure; guesses go in the same chat box (no separate control), a correct one promotes that figure to your new chat partner, and the streak keeps building — see [Guessing Game](#guessing-game-game)
- **Voice Responses**: Google Text-to-Speech API with character-specific voice configurations
- **Avatar Generation**: Claude generates a detailed image prompt; a free image provider renders the portrait — Cloudflare Workers AI (Flux Schnell) first, falling back to Pollinations.ai if it's unconfigured or fails — returned as a base64 data URL (or a durable Vercel Blob URL, if configured)
- **Smart Context Management**: Automatic conversation summarization when history exceeds 20 messages, with a rolling summary checkpoint for signed-in users so long conversations stay cheap
- **Real-time Streaming**: Server-Sent Events (SSE) for live response delivery
- **Optional Accounts**: Google sign-in persists a user's characters and chat history server-side (Neon Postgres); guest usage works fully without it — see [Account Persistence](#account-persistence-optional)
- **Character Wall**: A public, no-auth gallery at `/chars` of every portrait the app has ever generated, presented as a responsive tattered-parchment mosaic — see [Character Wall](#character-wall-chars)
- **Personalized Greeting**: Characters can greet you by name — a one-time, skippable prompt the first time you create a character, editable anytime from the account menu — see [Personalized Greeting](#personalized-greeting)
- **Internal Analytics**: A small self-hosted usage log (no third-party analytics service) plus an admin-only `/admin` stats view, with a nav link that only appears for signed-in admins — see [Internal Analytics](#internal-analytics-admin)
- **Comprehensive Testing**: Jest test suite with 80%+ branch coverage and 1,100+ passing tests
- **API Security**: Protected endpoints with origin validation and API key authentication
- **Responsive Design**: Mobile-friendly UI with dark mode support
- **Android/iOS App**: An Expo (React Native) client in `apps/mobile` with the same creation flow, chat, Character Wall, guessing game, leaderboard, and Past chats, calling this app's API. Logic, copy, and types live once in `packages/shared` and both clients use them. See [`apps/mobile/README.md`](apps/mobile/README.md)
- **Audio Replay**: Every character message has a speaker button to hear it again, on web and mobile

## Prerequisites

- Node.js ≥24
- npm or yarn
- Anthropic API key
- Google Cloud service account with the Text-to-Speech API enabled

## External Services & Accounts

Everything below is an **account you'd need to create**, not just an env var to fill in — grouped by what breaks without it, so you can tell up front what's actually required versus what only enables one optional feature.

| Service | Sign up at | Required? | Enables | Env vars |
| --- | --- | --- | --- | --- |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | **Required** | Chat replies, personality/avatar-prompt/voice-config generation, copyright & profanity validation — the app can't run at all without this | `ANTHROPIC_API_KEY` |
| **Google Cloud Platform** | [console.cloud.google.com](https://console.cloud.google.com) | **Required** | Text-to-Speech (voice replies), via a service account — see the "Google Cloud Setup" step under Quickstart below | `GOOGLE_APPLICATION_CREDENTIALS_JSON` |
| **Cloudflare** | [dash.cloudflare.com](https://dash.cloudflare.com) | Optional | Primary (free-tier) avatar image provider (Workers AI, Flux Schnell). Skip it and avatar generation still works via the Pollinations.ai fallback with no config at all | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |
| **Neon** (Postgres) | [neon.tech](https://neon.tech) | Optional | Server-side persistence: saved characters, chat history, the shared avatar cache table. Skip it and the app is a fully-functional guest-only experience | `DATABASE_URL` |
| **Google Cloud Console → OAuth credentials** | Same GCP project as above, but a *separate* setup step (APIs & Services → Credentials → OAuth client ID) — not the service account key | Optional | "Sign in with Google" on the landing page. Needs `DATABASE_URL` set too, or there's nothing to sign in *for* | `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **Any SMTP sender** (Gmail App Password, Resend, etc.) | No new account needed if you already have an inbox you can send mail from | Optional | Passwordless magic-link sign-in alongside Google. Needs `DATABASE_URL` set too | `EMAIL_SERVER`, `EMAIL_FROM` |
| **Vercel** | [vercel.com](https://vercel.com) | Optional | Deployment target, plus two of its own add-ons if you want them: **Blob** storage (durable avatar URLs instead of base64 data URLs) and **KV**/Marketplace Redis (shared rate-limit counters across serverless instances) | `VERCEL_BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL` + `KV_REST_API_TOKEN` |
| **Upstash** (Redis) | [upstash.com](https://upstash.com) | Optional | Same shared-rate-limit feature as Vercel KV above, if you'd rather provision Redis directly instead of through Vercel's marketplace | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |

**Minimum to run locally as a guest**: just Anthropic + Google Cloud. Everything else in the table is additive — the app degrades gracefully (never crashes, never 401s) with any or all of it unset.

## Quickstart (Local Development)

1. **Clone and install**:

```powershell
git clone https://github.com/andylacroce/character-chatbot-generator.git
cd character-chatbot-generator
npm install
```

1. **Environment Setup**

Create `.env.local` at project root with required secrets:

```ini
ANTHROPIC_API_KEY=sk-ant-...
API_SECRET=your_server_api_secret
GOOGLE_APPLICATION_CREDENTIALS_JSON=config/gcp-key.json
# Optional:
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_token
TTS_TMP_DIR=/custom/temp/path
# Optional, deployment only: makes API rate limits global instead of per-instance.
# Leave unset locally — the in-process limiter is the right fit for one dev server.
KV_REST_API_URL=https://your-store.upstash.io
KV_REST_API_TOKEN=your_rest_token
# Optional: view aggregate usage stats at /admin (see Internal Analytics below)
ADMIN_EMAILS=you@example.com
```

1. **Google Cloud Setup**

   - Create a GCP service account with the Text-to-Speech API enabled
   - Download the JSON key file
   - Place it at `config/gcp-key.json` or paste contents into `GOOGLE_APPLICATION_CREDENTIALS_JSON`

1. **Start Development Server**:

```powershell
npm run dev
```

Visit `http://localhost:3000`

### Helpful Scripts

- `npm run dev` — Next dev with Turbopack
- `npm run lint` / `npm run lint:fix`
- `npm run test` / `npm run test:watch` / `npm run test:coverage` (80%+ branch coverage enforced)
- `npm run type-check` / `npm run type-check:watch`
- `npm run analyze` — bundle analysis
- `npm run ci` — the full local gate before considering any change done; see below

## CI-Style Local Validation

`npm run ci` is the single composite command to run before considering work done. It
covers web, mobile, and the shared package: auto-format, lint, markdown lint, type-check,
mobile's own checks (including the Expo SDK dependency check), a read-only DB schema drift
check, TypeDoc generation, tests with coverage, and a production build.

```powershell
npm run ci
```

GitHub Actions runs the same checks as parallel jobs, and the required ones block merging
to `main`. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for every workflow, what blocks a merge, how
Dependabot and the weekly Expo SDK upgrade work, and troubleshooting.

## API Documentation

Every API route is documented with OpenAPI (Swagger) via `@swagger` JSDoc comments in `pages/api/*.ts`. Run the app locally and open:

```text
http://localhost:3000/reference
```

for an interactive reference (Scalar). The underlying spec is generated into `public/openapi.json` by `npm run docs:api`, which also runs automatically before `dev` and `build` — it isn't committed, so regenerate it after changing any route's annotations. Adding a new route means adding a `@swagger` block to its handler; nothing else needs wiring up.

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` — Anthropic API key for chat and avatar prompt generation
- `API_SECRET` — Server-side API secret for request authorization
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — Path to GCP JSON key or full JSON content (for Text-to-Speech)

### Optional

- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` — Enables Cloudflare Workers AI (Flux Schnell) as the primary avatar image provider. Without them, avatar generation still works via the Pollinations.ai fallback with no config at all
- `VERCEL_BLOB_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN`) — Enables logging to Vercel Blob storage, and durable Blob-hosted avatar URLs instead of base64 data URLs
- `TTS_TMP_DIR` — Custom path for temporary TTS files (defaults to system temp)
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Redis REST endpoint (Vercel KV / Marketplace Redis) used to share API rate-limit counters across serverless instances. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` work too. With neither pair set, limits fall back to an in-process counter, which is per-instance on Vercel and exactly right for local development.
- `DATABASE_URL` + `NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Enables optional Google account sign-in and server-side persistence (see [Account Persistence](#account-persistence-optional) below). The app is fully functional as a guest with none of these set.
- `EMAIL_SERVER` + `EMAIL_FROM` — Enables passwordless magic-link sign-in alongside Google (a plain SMTP connection string works — Gmail App Password, Resend, etc.). Needs `DATABASE_URL` set too.
- `GAME_TOKEN_SECRET` — Key used to encrypt the guessing game's round token (see [Guessing Game](#guessing-game-game) below). Falls back to `NEXTAUTH_SECRET`, then the already-required `API_SECRET`, so the game works with zero new configuration.
- `ADMIN_EMAILS` — Comma-separated allowlist of emails allowed to view the internal `/admin` stats page (see [Internal Analytics](#internal-analytics-admin) below). With none set, nobody is admin. Never honored on a Vercel Preview deployment regardless of this value.

## Avatar Generation

When a character chatbot is created, the app generates a portrait avatar automatically:

1. **Prompt generation** — Claude (`claude-haiku-4-5-20251001`) receives the character name and produces a detailed, safe-for-work image prompt describing appearance, era, and artistic style.
2. **Image rendering** — free providers only, no payment method required. Cloudflare Workers AI (`@cf/black-forest-labs/flux-1-schnell`) renders it first when `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` are configured; if they're unset, or Cloudflare errors or is rejected by its own safety filter, it falls back to Pollinations.ai (free, anonymous, no API key — though its anonymous tier may render a small watermark).
3. **Display** — The result is a base64 data URL (or a durable Vercel Blob URL, if `VERCEL_BLOB_READ_WRITE_TOKEN` is configured) rendered directly in the UI; no external image hosting is required beyond that.

### Requirements

None, strictly — Pollinations.ai needs no configuration at all. Setting `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (a free Cloudflare account, Workers AI enabled) gets you the higher-quality primary provider instead of relying on the fallback for every avatar.

### Rate limit

Avatar generation is capped at **5 requests per minute per IP** because image generation calls are relatively expensive compared to text inference.

## API Security

Multi-layered protection for all API endpoints:

- **Origin Validation**: Automatic authentication for localhost, Vercel production, and preview deployments
- **API Key Authentication**: External origins require valid `x-api-key` header matching `API_SECRET`
- **Route Protection**: All `/api/*` endpoints secured via proxy middleware
- **Request Logging**: Failed authentication attempts logged for monitoring

**Custom Domains**: Update `allowedHosts` in `proxy.ts` when deploying to custom domains.

## Account Persistence (Optional)

The app is fully usable as a guest — nothing below is required. When `DATABASE_URL` +
`NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, users can sign in
with Google to save their characters and chat history server-side (Neon Postgres via
Drizzle ORM), so both survive across devices and browser sessions:

- **Sign-in**: A landing-page-only control (`AuthControl`) using Auth.js (`next-auth@4`,
  JWT sessions, no `sessions` table). Clicking "Sign in" opens an in-page lightbox
  (`SignInModal`) with a "Continue with Google" button, rather than redirecting straight
  off-site or (Auth.js's default) a bare picker page. On Vercel preview deployments, an
  unverified stub provider stands in for Google, since OAuth redirect matching can't
  follow per-push preview URLs, and signs in immediately with no lightbox — it's a
  smoke-test aid, not a real login.
- **Magic-link sign-in (optional, alongside Google)**: set `EMAIL_SERVER` (a plain SMTP
  connection string) and `EMAIL_FROM` to also offer passwordless email sign-in —
  `SignInModal` shows it whenever the server reports the `email` provider configured.
  Works with a Gmail App Password, Resend's SMTP endpoint, or any other SMTP provider;
  see `.env.example`. Unlike Google, it has no OAuth redirect restriction, so it's
  offered on preview deployments too whenever configured.
- **Characters**: Created or resumed characters are saved to a `bots` table
  (`POST`/`GET /api/bots`) once signed in. The "Past chats" page (`/history`, linked from
  the landing page and the account menu) lists them, most recently updated first.
- **Chat history**: Once a character is saved, `/api/chat` becomes the source of truth for
  its personality and message history instead of trusting the client on every request, and
  persists each turn to a `messages` table. A rolling summarization checkpoint keeps long
  conversations cheap — most turns reuse the existing summary instead of re-summarizing from
  scratch. `GET /api/messages` lets the chat UI catch up with the server's copy on load.
- **Avatar cost sharing**: Generated portraits are cached globally by character name
  (`avatar_cache` table), shared across every user (guest or signed-in) and environment,
  since image generation is the most expensive call in the app.
- **Copyright-warning overrides are never persisted**: if a user proceeds past a
  copyright/trademark warning anyway, that character and its portrait are never saved to the
  shared avatar cache, Vercel Blob, or the user's own account — it works for that session
  only, exactly like a guest's.
- **Schema changes**: apply locally with `npm run db:push` (Drizzle Kit) after pulling
  changes to `src/db/schema.ts`. Not part of `npm run ci`, since it mutates external state.

See `CLAUDE.md`'s "Account persistence" section for the full phase-by-phase design notes.

## Character Wall (`/chars`)

A public gallery of every character portrait the app has ever generated — no sign-in
required. It reads from the same global `avatar_cache` table described in
[Account Persistence](#account-persistence-optional) above, so a name only ever needs to be
generated once for it to show up here for everyone.

- **Design**: the page itself is a broad sheet of tattered parchment holding a dense,
  masonry-style collage of deckled archival prints. It uses the available width instead of
  dividing portraits into book spreads, then steps down to two columns on phones and one on
  the narrowest screens. Card shape and restrained rotation are derived from a hash of the
  character's name, so the composition stays stable across reloads.
- **Sort and group controls**: the toolbar defaults to Recently added with grouping off. It
  can order the complete collection by newest, oldest, or name, while the Group by category
  switch reveals collapsed, independently expandable sections for Historical Figures,
  Mythology, Literature, Folklore & Legend, Religion & Philosophy, and Other. Sorting happens
  before API pagination, so scrolling never produces page-local ordering artifacts.
- **Long-gallery navigation**: a high-contrast floating "To top" control appears only after
  360px of actual scrolling. It listens to the body (the scroll owner in this app's flex
  layout) plus the window/document fallbacks used by other engines, then scrolls a marker
  before the app header into view. It stays clear of common lower-corner widgets and phone
  safe areas, and respects reduced-motion preferences.
- **Scales without hammering the database**: paginated (`GET /api/chars?limit=&offset=`) and
  backed by a 60-second in-process cache, so a burst of visitors scrolling through hundreds of
  portraits costs at most one database query per minute, not one per page of results.
- **Category data**: new portraits persist their category in `avatar_cache` as part of the
  existing Claude prompt-generation response. After adding the nullable column with
  `npm run db:push`, run `npm run chars:backfill-categories -- --dry-run` to preview the
  historical classification, then `npm run chars:backfill-categories` to fill only rows that
  are still uncategorized.
- **Click a portrait to open it full-size** in a native `<dialog>` lightbox, with a "Chat with
  this character" button that launches straight into a conversation — resuming your own saved
  version of that character if you're signed in and already created one, or generating a fresh
  one otherwise. It's the same landing-page launch path as typing a name in yourself, just
  skipping straight past the form.
- **Abusive names never reach this page**: every name is checked for profane/abusive content
  as part of the same Claude-powered validation round-trip that screens for copyright
  concerns, before a character (and its portrait) can be created at all. Unlike a copyright
  warning, there's no "Continue Anyway" for this check.
- **Fuzzy name matching**: typing a slight misspelling or alternate spelling of an
  already-created character (e.g. "sherlok holmes") reuses that character's existing
  portrait and casing instead of generating a near-duplicate — Claude checks new names
  against a sample of existing ones as part of the personality-generation call it's
  already making, so this costs no extra API round trip.

## Guessing Game (`/game`)

A second mode alongside ordinary chat: a "guess who" chain game, no sign-in required.

- **How it works**: you start a run in a normal-feeling chat with a real, named character
  (revealed — name and avatar shown just like any other chat). That character steers the
  conversation toward a *different, hidden* figure it has in mind, and your job is to
  figure out who. There's no separate guess control — type both ordinary questions and
  guesses into the same box; the server classifies which is which on every turn, and asks
  you to confirm when it's genuinely unclear rather than guessing on your behalf.
- **Scoring**: one wrong guess per hidden figure is forgiven; a second ends the run. A
  correct guess reveals the answer and holds on a "Continue" button before that figure
  becomes your new chat partner — continuing the chain and building a streak. Give up
  anytime, via the menu or by typing it directly into the chat ("I give up"), and you're
  always told the answer.
- **No database required**: the round's state (including the still-hidden figure's name)
  lives entirely in an encrypted token your browser holds and echoes back on every
  request — guest play needs zero server-side session storage.
- **Audio parity with ordinary chat**: every reply gets the same Google TTS voice
  response as a normal conversation.
- **Leaderboard (`/leaderboard`, opt-in)**: any player — signed in or guest — whose
  best streak reaches the overall top 10 can claim a moderated public display name.
  Guest scores are bound to a persistent, HTTP-only browser cookie (no sign-in needed);
  names are screened by Claude before publishing. Claim or update your name from the
  game-over panel or the leaderboard page (linked from the account menu); leaving
  removes the public name while keeping the private best.

## Personalized Greeting

Characters can greet you by name. The first time you create a character without one
known yet, a small skippable prompt asks what to call you — decline and it just never
asks again in that browser. Set anytime from the account menu (click your name, or
"Guest", in the header) via "Add your name" / "Change your name".

- **Guest or signed in**: guests keep it in local storage; signing in persists it
  server-side (same Neon Postgres database as [Account Persistence](#account-persistence-optional))
  so it follows you across devices.
- **Shows up everywhere**: the character's greeting, your own messages in the chat
  transcript (in place of the generic "Me"), and downloaded transcript files all use it
  live — changing your name updates already-open chats immediately, not just new ones.
- **Optional, always**: skip it and nothing changes except the character calling you
  "friend" instead of by name.

## Internal Analytics (`/admin`)

Vercel Analytics/Speed Insights (already wired into `app/layout.tsx`) cover page views and
performance. This is the *product*-usage layer on top — deliberately a small, self-hosted
event log rather than a third-party analytics service (Splunk, Datadog, etc.), since this
app is a single hobby-scale Vercel deployment, not a system that needs that kind of infra
observability.

- **Why it exists**: most usage — guest sessions, likely the majority of traffic since
  sign-in isn't required — never touches the database at all, so without this, real usage
  is largely invisible. An `analytics_events` table (Neon Postgres, same database as
  [Account Persistence](#account-persistence-optional) above) records a handful of
  low-frequency, high-signal events: character validation outcomes, which avatar provider
  actually served an image, character-creation counts, and guessing-game starts, scored
  guesses, continued rounds, and endings. Game events store only guest status, numeric
  streaks, and fixed outcome labels. None record character names, guesses, or chat text.
- **`/admin`** is an admin-only page with separate Guessing game and Character creation
  tabs showing aggregate counts only — no per-user or
  per-guest detail. The access check runs server-side (`isAdminSession()`) and 404s
  anyone who isn't a confirmed admin before the stats view or its bundle ever renders,
  rather than loading the page and showing a "not authorized" message. Gated by the
  optional `ADMIN_EMAILS` env var (comma-separated allowlist of emails); with none set,
  nobody can access it. It's never reachable on a Vercel Preview deployment regardless of
  email match, since Preview's sign-in stub issues sessions with zero identity
  verification (see [Account Persistence](#account-persistence-optional) above).
  The guessing-game section shows starts, guess accuracy, guest share, continued rounds,
  ending reasons, final streaks, and a 7/30/90-day activity chart with an exact-count
  table. The date control applies only to that chart and table; the other game totals
  cover all recorded activity. Game analytics begin with the deployment that adds these events; earlier plays
  cannot be reconstructed from the stateless game token or personal high scores. Abandoned
  runs have no ending event, and the event counts are best effort.
- **Discoverable, if you're an admin**: a cheap `GET /api/admin/is-admin` check (no
  database query — just the same session/allowlist check the page itself enforces) lets
  the account menu show an "Admin Stats" link only to signed-in admins, instead of it
  being an unlinked URL you have to remember. This is a convenience, not the security
  boundary — the page and its data endpoint enforce their own access control regardless
  of whether the link is visible.
- **Fully optional**: skip `ADMIN_EMAILS` (and even `DATABASE_URL`) and nothing about the
  rest of the app changes — this is a read-only view for the app's operator, not a
  user-facing feature.

## Storage (Client-Side)

Uses safe storage wrapper at `src/utils/storage.ts` with localStorage and in-memory fallback
— this is the only storage a guest ever uses, and stays the fast-loading cache for a
signed-in user too (the server is the durable copy; see
[Account Persistence](#account-persistence-optional) above).

**Storage Keys**:

- `voiceConfig-<bot.name>` — Versioned voice configuration
- `chatbot-bot` — Current bot data
- `chatbot-history-<bot.name>` — Chat history
- `audioEnabled` — Audio toggle state
- `darkMode` — Theme preference
- `bot-session-id` — Session tracking
- `chatbot-user-name` — The visitor's own name (guests only; a signed-in user's name is
  persisted server-side instead — see [Personalized Greeting](#personalized-greeting))
- `chatbot-user-name-gate-skipped` — Set once a guest dismisses the post-creation name
  prompt, so it doesn't reappear on that browser
- `chatbot-game-token` / `chatbot-game-transcript`: the guessing game's encrypted round
  token and its transcript, so a reload resumes the run
- `chatbot-game-instructions-seen`: the guessing game's one-time "how to play" gate
- `chatbot-landing-carousel-cache`: the landing carousel's last portrait sample, shown
  instantly on the next visit

Every key lives once in `packages/shared/src/storageKeys.ts`, which both the web app and
the mobile app import.

**Important**: Never store secrets or PII in client storage. All data is client-side only.

## Project Structure

```text
app/                     # Next.js App Router UI
   components/           # Client components and hooks (ChatShell, GamePage, useBotCreation, ...)
   chars/, game/, leaderboard/, history/, admin/, auth/  # Character Wall, guessing game, leaderboard, Past chats, admin, sign-in
pages/api/               # API routes (Pages Router; server handlers are authoritative)
   chat.ts               # Main chat endpoint with streaming & summarization
   audio.ts              # TTS audio generation (also regenerates replay audio on demand)
   validate-character.ts, generate-personality.ts, generate-avatar.ts, get-voice-config.ts  # Character creation pipeline
   chars.ts              # Character Wall / carousel data
   random-character.ts   # Public domain character suggestions
   bots.ts, messages.ts, user-profile.ts  # A signed-in user's characters, chat history, and name (optional)
   game/                 # Guessing game: start, message, continue, give-up, high-score, leaderboard, leaderboard-settings
   admin/                # Admin-only stats and copyright moderation
   auth/                 # Auth.js, plus the mobile sign-in bridge (mobile-auth-start/-complete, mobile-session)
src/
   utils/                # Server utilities (TTS, logger, rate limiting, security, game token, ...)
   config/               # Prompt builders and server configuration
   data/                 # Curated character-name lists
   db/                   # Drizzle schema + client (optional account persistence)
   auth/                 # Auth.js configuration (Google sign-in)
packages/shared/         # character-chatbot-shared: types, copy, storage keys, validation, and shared
                         # hooks (useCharacterCreation, useGameSession, useCharacterCarousel, ...)
apps/mobile/             # Expo (React Native) client; see apps/mobile/README.md
   src/screens/          # Creator, Chat, CharWall, History, Game, Leaderboard
   src/components/       # ChatView, modals, carousel, header title, lightbox, ...
tests/                   # Web Jest suite (80%+ coverage gate); mobile and shared keep their own tests
proxy.ts                 # API authentication middleware (Next.js 16)
```

## Troubleshooting

### Hydration Mismatch Warning

React hydration warnings from browser extensions (e.g., Dark Reader) are expected. The root `<html>` element has `suppressHydrationWarning` enabled. Disable browser extensions during development if needed.

### TTS Errors

Ensure `GOOGLE_APPLICATION_CREDENTIALS_JSON` is set correctly and the service account has Text-to-Speech API enabled.

### Streaming Issues

Check browser console for SSE connection errors. Ensure the API endpoint isn't being blocked by corporate firewalls.

## Contributing

PRs welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for the checklist and how CI works.

## License & Disclaimer

**Beta status**: this app is in early beta — expect bugs and rough edges. It's for entertainment purposes only; no information it provides should be considered professional, legal, medical, or financial advice, and content may be AI-generated and inaccurate. Use at your own risk.

All rights reserved — see [LICENSE](LICENSE). Source is publicly viewable for portfolio purposes only; no permission is granted to use, copy, modify, or redistribute it. Not affiliated with Anthropic or Google.

**Copyright Notice**: This app includes AI-powered copyright/trademark validation to help users avoid creating chatbots based on copyrighted or trademarked characters. When a potentially copyrighted character is detected, users receive warnings and suggestions for public domain alternatives. Users are solely responsible for ensuring their use complies with applicable copyright and trademark laws. The validation system provides guidance but does not constitute legal advice.

## Agent Instructions

Codex reads [`AGENTS.md`](AGENTS.md) at the repository root. The lightweight
Copilot pointer remains at `./.github/copilot-instructions.md`; both agent guides
refer to [`CLAUDE.md`](CLAUDE.md) for the detailed architecture and historical
reasons behind non-obvious behavior.
