# Getting started

Your first day: from clone to a merged change. For the big picture, read [architecture.md](architecture.md) next.

## 1. Run it

Follow the [README quickstart](../README.md#quickstart). You only need three values in `.env.local`:
`ANTHROPIC_API_KEY`, `API_SECRET` (any long random string), and
`GOOGLE_APPLICATION_CREDENTIALS_JSON` (the service-account JSON on one line, in single quotes).
Without a database the app runs as a guest-only experience, which is all you need for most work.

Chat and the games spend real Anthropic tokens. In development they use the cheaper Haiku model.

## 2. Follow one request

Send a chat message and trace it. This single path teaches most of the codebase:

1. `src/app/components/chat/useChatController.ts` holds the chat state and calls `authenticatedFetch`.
2. `src/utils/api.ts` (`authenticatedFetch`) is the only way the UI talks to the server.
3. `src/proxy.ts` checks the request origin and API key before any API route runs.
4. `src/pages/api/chat.ts` builds the prompt (`src/utils/chat/chatContext.ts`), calls Claude through
   `src/utils/claude/`, and returns the reply.
5. `src/pages/api/audio.ts` turns the reply into speech (`src/utils/chat/tts.ts`).

## 3. Where does my change go?

| I want to change... | Look in |
| --- | --- |
| Chat screen, messages, input | `src/app/components/chat/` |
| Character creation, the wall, the landing carousel | `src/app/components/character/` |
| The guessing games' UI and leaderboard | `src/app/components/game/` |
| Sign-in, account menu, past chats | `src/app/components/account/` |
| Header, modals, dark mode, other shared UI | `src/app/components/common/` |
| An API endpoint | `src/pages/api/` (add a `@swagger` JSDoc block) |
| A Claude prompt | `src/config/`, `src/utils/chat/`, `src/utils/game/` |
| Game rules, scoring, tokens | `src/utils/game/` |
| Validation and the allow/block lists | `src/utils/moderation/` |
| Logic that web and mobile both use | `packages/shared/src/` |
| Database tables | `src/db/schema.ts`, then `npm run db:push` |

Each feature also has a rule file in `.claude/rules/` with its deeper design notes. They are written for
AI agents but read fine as plain feature notes.

## 4. The two rules that surprise people

- **Web and mobile move together.** Shared logic lives in `packages/shared`; each app only supplies a thin
  adapter (network, storage). If you change behavior that exists on both, update both in the same PR.
- **Every API call goes through `authenticatedFetch`**, never raw `fetch`, so it passes the `proxy.ts` check
  and tests can mock it in one place.

## 5. Check your work

- While coding: `npm run check` (lint, type-check, tests for your uncommitted changes).
- Before opening a PR: `npm run ci`. It is slower, runs everything, and auto-formats.
- Run one test file with `npx jest tests/pages/api/chat.test.ts`, or by name with `npx jest -t "some name"`.
- Tests live in `tests/`. Coverage must stay above 80%.

## 6. Ship it

`main` is protected. Make a branch, open a PR, and merge once checks are green. See
[CONTRIBUTING](../.github/CONTRIBUTING.md) for the checklist, CI layers, and versioning.

## Stuck?

Start with the README troubleshooting section, then [decisions-history.md](decisions-history.md) for
why something unusual is the way it is.
