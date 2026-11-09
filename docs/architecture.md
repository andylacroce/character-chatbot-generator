# Architecture

How the pieces fit together. Feature-by-feature behavior is in [features.md](features.md).

## The shape

```text
Browser / Expo app
      |  authenticatedFetch (web)  |  fetch + API key (mobile)
      v
src/proxy.ts            checks Origin/Referer (web) or x-api-key (everything else)
      v
src/pages/api/*         thin handlers: validate input, rate limit, call utils, respond
      v
src/utils/*             Claude calls, TTS, moderation, game rules, persistence
      v
Anthropic, Google TTS, Cloudflare/Pollinations, Neon Postgres (optional), Vercel Blob (optional)
```

Web and mobile share `packages/shared` for types, copy, validation, storage keys, and state-machine
hooks. Each platform adds only its own transport, storage, and logging.

## Ideas worth knowing

1. **`src/proxy.ts` is the single auth choke point.** Browsers pass on a matching Origin; everyone else
   needs `x-api-key`. It is CSRF protection, not authentication, so the per-route rate limiter
   (`src/utils/server/rateLimit.ts`) is the real cost ceiling.
2. **Claude calls use model tiers**, chosen at the call site (`src/utils/claude/claudeModelSelector.ts`):
   `text` for chat replies, `text-simple` for short structured JSON tasks, and `image` for avatar prompts.
   All calls share one client (`anthropicClient.ts`) and pass `thinking` settings from `claudeThinking.ts`.
3. **Everything optional degrades quietly.** No database means guest-only. No Redis means in-process rate
   limits. No Cloudflare means Pollinations avatars. Code must keep those fallbacks working.
4. **Games are stateless on the server.** A round's hidden answer lives in an encrypted token the client holds
   (`src/utils/game/token.ts`). Both games share one engine; `src/pages/api/[game]/` serves them and
   `src/utils/game/definitions.ts` describes how they differ.
5. **Signed-in chats are server-authoritative.** Once a character is saved, `/api/chat` reads personality and
   history from the database instead of trusting the client, and keeps a rolling summary so long chats stay cheap.
6. **Moderation runs before creation.** A name is checked against the allow/block lists
   (`src/utils/moderation/`), then validated by Claude for copyright and profanity, before a character or
   portrait exists.

## Code map

| Path | Contents |
| --- | --- |
| `src/app/` | App Router pages. `components/` is grouped by feature, with CSS modules in `components/styles/` |
| `src/pages/api/` | API routes. Pages Router on purpose: see [decisions-history.md](decisions-history.md) |
| `src/utils/claude/` | Anthropic client, model tiers, thinking config, JSON parsing |
| `src/utils/chat/` | Chat context, summarization, persistence, TTS, voices, transcripts |
| `src/utils/avatar/` | Avatar image rendering through Cloudflare and Pollinations |
| `src/utils/moderation/` | Allow/block lists, character classifier, warning log, wall data |
| `src/utils/game/` | Game definitions, rounds, scoring, tokens, guess classification, leaderboards |
| `src/utils/account/` | Session lookup, admin checks, magic-link mail, per-user blobs |
| `src/utils/server/` | Rate limiting, request security, request logging, token crypto |
| `src/utils/*.ts` | Cross-cutting helpers: `api`, `logger`, `storage`, `environment`, `analytics`, `sse` |
| `src/config/` | Prompt builders and server configuration |
| `src/db/` | Drizzle schema and client |
| `packages/shared/` | Code used by both web and mobile |
| `apps/mobile/` | The Expo client |

## Unusual choices, and why

- **No `"type": "module"` in `package.json`.** Adding it once crashed Vercel's CJS launcher. `next.config.mjs`
  stays ESM through its extension.
- **API routes stay on the Pages Router.** They use Node-only SDKs, already stream with `res.write`, and mobile
  depends on their behavior.
- **Server-sent events for game progress on web only.** React Native's `fetch` cannot read an SSE stream, so
  mobile uses plain JSON.

More history and removed features: [decisions-history.md](decisions-history.md). The deepest notes live in
`CLAUDE.md` and `.claude/rules/`.
