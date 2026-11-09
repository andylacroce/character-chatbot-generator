# Portrayal

[![License: Proprietary](https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg)](LICENSE)
[![CI](https://github.com/andylacroce/character-chatbot-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/andylacroce/character-chatbot-generator/actions/workflows/ci.yml)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-orange.svg)](#license--disclaimer)

**This app is in early beta.** Expect bugs and rough edges. See [License & Disclaimer](#license--disclaimer).

A Next.js 16 + TypeScript app for chatting with history's greatest minds, legendary heroes, and literary icons, with Claude-powered responses, factually-grounded personalities, and Google Text-to-Speech audio replies.

**[Live demo](https://character-chatbot-generator.vercel.app)**

## What it does

- Chat with an established historical, mythological, literary, or fictional character, with a generated portrait and a character-specific voice
- Two guessing games (`Guess Who` and `Guess Who's Next`) with streaks and public leaderboards
- A public Character Wall of every portrait generated so far
- Optional Google or magic-link sign-in that saves characters and chats across devices; guests get the full app without it
- AI copyright/trademark and profanity validation, plus an admin moderation panel
- An Expo (React Native) mobile app in `apps/mobile`, sharing logic with the web app through `packages/shared`

## New here?

1. [Getting started](docs/getting-started.md): run it locally and make your first change
2. [Architecture](docs/architecture.md): how a request flows and where code lives
3. [Feature reference](docs/features.md): how each feature works and what it stores
4. [Configuration](docs/configuration.md): every account and environment variable
5. [Contributing](.github/CONTRIBUTING.md): the PR checklist, CI, and release flow

## Quickstart

You need Node.js 24 or newer, an [Anthropic API key](https://console.anthropic.com), and a Google Cloud service account with the Text-to-Speech API enabled.

```powershell
git clone https://github.com/andylacroce/character-chatbot-generator.git
cd character-chatbot-generator
npm install
```

Create `.env.local` (see `.env.example`) with the three required values:

```ini
ANTHROPIC_API_KEY=sk-ant-...
API_SECRET=any_long_random_string
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
```

Keep the service-account JSON on one line inside single quotes. Then:

```powershell
npm run dev
```

Visit `http://localhost:3000`. Everything else is optional; see [Configuration](docs/configuration.md).

## Commands

- `npm run dev`: Next dev server with Turbopack
- `npm run check`: fast inner loop (lint, type-check, and tests for your uncommitted changes)
- `npm run ci`: the full gate (web, mobile, shared) to run before calling work done
- `npm run test` / `test:watch` / `test:coverage`: Jest (80% coverage gate)
- `npm run lint:fix` / `format`: auto-fix lint and formatting

The full list is in [`package.json`](package.json). API routes are documented with OpenAPI; run the app and open `http://localhost:3000/reference` for the interactive reference.

## Project structure

```text
src/
   app/                  # Next.js App Router pages
      components/        # UI by feature: chat/, character/, game/, account/, admin/, common/ (+ styles/ CSS modules)
   pages/api/            # API routes (Pages Router; the authoritative server handlers)
   proxy.ts              # API authentication (Next.js 16 proxy)
   utils/                # Server and client helpers by feature: claude/, chat/, avatar/,
                         # moderation/, game/, account/, server/ (plus api, logger, storage, ...)
   config/               # Prompt builders and server configuration
   data/                 # Curated character-name lists
   db/                   # Drizzle schema + client (optional account persistence)
   auth/                 # Auth.js configuration
packages/shared/         # Types, copy, validation, and hooks used by both web and mobile
apps/mobile/             # Expo client; see apps/mobile/README.md
tests/                   # Web Jest suite
config/                  # Tool configs (TypeDoc, Drizzle, markdownlint)
docs/                    # Human-readable guides
```

## Troubleshooting

### Hydration Mismatch Warning

React hydration warnings from browser extensions (e.g., Dark Reader) are expected. The root `<html>` element has `suppressHydrationWarning` enabled. Disable browser extensions during development if needed.

### TTS Errors

Ensure `GOOGLE_APPLICATION_CREDENTIALS_JSON` is set correctly (one line, single quotes) and the service account has the Text-to-Speech API enabled.

### Game Progress Stuck Loading

`Guess Who's Next` streams round-generation progress over SSE. Check the browser console for connection errors, and make sure a corporate proxy or firewall isn't buffering or blocking `/api/guess-who-next/*` responses.

## Support

Questions, bug reports, or data requests: [portrayal-support@andrewlacroce.com](mailto:portrayal-support@andrewlacroce.com). Signed-in users can delete their account themselves from the app's menu; see the [data deletion](https://character-chatbot-generator.vercel.app/data-deletion) page.

## License & Disclaimer

**Beta status**: this app is in early beta — expect bugs and rough edges. It's for entertainment purposes only; no information it provides should be considered professional, legal, medical, or financial advice, and content may be AI-generated and inaccurate. Use at your own risk.

All rights reserved — see [LICENSE](LICENSE). Source is publicly viewable for portfolio purposes only; no permission is granted to use, copy, modify, or redistribute it. Not affiliated with Anthropic or Google.

**Copyright Notice**: This app includes AI-powered copyright/trademark validation to help users avoid creating chatbots based on copyrighted or trademarked characters. When a potentially copyrighted character is detected, users receive warnings and suggestions for public domain alternatives. Users are solely responsible for ensuring their use complies with applicable copyright and trademark laws. The validation system provides guidance but does not constitute legal advice.

## Agent Instructions

Codex reads [`AGENTS.md`](AGENTS.md) at the repository root. The lightweight
Copilot pointer remains at `./.github/copilot-instructions.md`; both agent guides
refer to [`CLAUDE.md`](CLAUDE.md) for the detailed architecture and historical
reasons behind non-obvious behavior.
