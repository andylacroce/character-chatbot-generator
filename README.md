## Project Structure

```text
app/
   components/        # React components & hooks
      CopyrightWarningModal.tsx  # Warning modal for copyrighted characters
      useBotCreation.ts          # Bot creation with validation flow
pages/api/           # API routes (chat, audio, health, transcript)
   chat.ts            # Main chat endpoint with streaming & summarization
   audio.ts           # TTS audio generation
   generate-avatar.ts # Avatar generation via Claude + Gemini image generation (Gemini Enterprise Agent Platform, formerly Vertex AI)
   validate-character.ts # Copyright/trademark validation
   random-character.ts   # Public domain character suggestions
   bots.ts            # List/persist a signed-in user's characters (optional)
   messages.ts        # List a signed-in user's chat history for one character (optional)
src/
   utils/             # Utilities (TTS, logger, cache, security)
   types/             # TypeScript type definitions
   config/            # Configuration files
   db/                # Drizzle schema + client (optional account persistence)
   auth/              # Auth.js configuration (Google sign-in)
tests/               # Jest test suite (80%+ branch coverage)
proxy.ts             # API authentication middleware (Next.js 16)
```

# Character Chatbot Generator

A Next.js 16 + TypeScript app that provides a character-driven chat UI with Claude-powered responses and Google Text-to-Speech audio replies.

## Key Features

- **Claude AI Integration**: Uses claude-sonnet-4-6 (production chat) / claude-haiku-4-5-20251001 (dev + simple tasks) with streaming responses and conversation summarization
- **Copyright Protection**: AI-powered character validation with copyright/trademark detection and public domain suggestions
- **Voice Responses**: Google Text-to-Speech API with character-specific voice configurations
- **Avatar Generation**: Claude generates a detailed image prompt; Gemini image generation (`gemini-3.1-flash-lite-image`) on Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI) renders a portrait and returns it as a base64 data URL
- **Smart Context Management**: Automatic conversation summarization when history exceeds 20 messages, with a rolling summary checkpoint for signed-in users so long conversations stay cheap
- **Real-time Streaming**: Server-Sent Events (SSE) for live response delivery
- **Optional Accounts**: Google sign-in persists a user's characters and chat history server-side (Neon Postgres); guest usage works fully without it — see [Account Persistence](#account-persistence-optional)
- **Character Wall**: A public, no-auth gallery at `/chars` of every portrait the app has ever generated, laid out as a scattered polaroid/corkboard collage — see [Character Wall](#character-wall-chars)
- **Comprehensive Testing**: Jest test suite with 80%+ branch coverage and 900+ passing tests
- **API Security**: Protected endpoints with origin validation and API key authentication
- **Responsive Design**: Mobile-friendly UI with dark mode support

## Prerequisites

- Node.js ≥18
- npm or yarn
- Anthropic API key
- Google Cloud service account with Text-to-Speech and Gemini Enterprise Agent Platform (formerly Vertex AI) APIs enabled

## External Services & Accounts

Everything below is an **account you'd need to create**, not just an env var to fill in — grouped by what breaks without it, so you can tell up front what's actually required versus what only enables one optional feature.

| Service | Sign up at | Required? | Enables | Env vars |
| --- | --- | --- | --- | --- |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | **Required** | Chat replies, personality/avatar-prompt/voice-config generation, copyright & profanity validation — the app can't run at all without this | `ANTHROPIC_API_KEY` |
| **Google Cloud Platform** | [console.cloud.google.com](https://console.cloud.google.com) | **Required** | Text-to-Speech (voice replies) and Gemini image generation (avatar portraits), via one service account — see the "Google Cloud Setup" step under Quickstart below | `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_CLOUD_PROJECT` |
| **Neon** (Postgres) | [neon.tech](https://neon.tech) | Optional | Server-side persistence: saved characters, chat history, the shared avatar cache table. Skip it and the app is a fully-functional guest-only experience | `DATABASE_URL` |
| **Google Cloud Console → OAuth credentials** | Same GCP project as above, but a *separate* setup step (APIs & Services → Credentials → OAuth client ID) — not the service account key | Optional | "Sign in with Google" on the landing page. Needs `DATABASE_URL` set too, or there's nothing to sign in *for* | `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
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
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
# Optional:
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_token
TTS_TMP_DIR=/custom/temp/path
# Optional, deployment only: makes API rate limits global instead of per-instance.
# Leave unset locally — the in-process limiter is the right fit for one dev server.
KV_REST_API_URL=https://your-store.upstash.io
KV_REST_API_TOKEN=your_rest_token
```

1. **Google Cloud Setup**

   - Create a GCP service account with Text-to-Speech and Gemini Enterprise Agent Platform (formerly Vertex AI) APIs enabled
   - Grant the service account the `roles/aiplatform.user` role for Gemini image generation
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
- `npm run test` / `npm run test:watch` / `npm run test:coverage`
- `npm run type-check` / `npm run type-check:watch`
- `npm run analyze` — bundle analysis
- `npm run ci` — lint + type-check + coverage + build

## Testing

Run the full test suite with coverage:

```powershell
npm run test:coverage
```

Run linting:

```powershell
npm run lint
```

Run type-check only:

```powershell
npm run type-check
```

## CI-Style Local Validation

Use a single command to run lint, TypeScript type-check, tests with coverage, and a production build:

```powershell
npm run ci
```

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
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — Path to GCP JSON key or full JSON content
- `GOOGLE_CLOUD_PROJECT` — GCP project ID for Gemini image generation (Gemini Enterprise Agent Platform, formerly Vertex AI)

### Optional

- `VERCEL_BLOB_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN`) — Enables logging to Vercel Blob storage, and durable Blob-hosted avatar URLs instead of base64 data URLs
- `TTS_TMP_DIR` — Custom path for temporary TTS files (defaults to system temp)
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Redis REST endpoint (Vercel KV / Marketplace Redis) used to share API rate-limit counters across serverless instances. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` work too. With neither pair set, limits fall back to an in-process counter, which is per-instance on Vercel and exactly right for local development.
- `DATABASE_URL` + `NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Enables optional Google account sign-in and server-side persistence (see [Account Persistence](#account-persistence-optional) below). The app is fully functional as a guest with none of these set.

## Avatar Generation

When a character chatbot is created, the app generates a portrait avatar automatically:

1. **Prompt generation** — Claude (`claude-haiku-4-5-20251001`) receives the character name and produces a detailed, safe-for-work image prompt describing appearance, era, and artistic style.
2. **Image rendering** — The prompt is sent to Gemini image generation (`gemini-3.1-flash-lite-image`) on Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI) which returns a square PNG as a base64 data URL.
3. **Display** — The data URL is rendered directly in the UI; no external image hosting is required.

### Requirements

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` must reference a service account with `roles/aiplatform.user` granted in the GCP project.
- `GOOGLE_CLOUD_PROJECT` must be set to the project where the Gemini Enterprise Agent Platform (formerly Vertex AI) API is enabled.
- The `aiplatform.googleapis.com` API must be enabled in that project.

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
- **Characters**: Created or resumed characters are saved to a `bots` table
  (`POST`/`GET /api/bots`) once signed in. `ResumeBotDropdown` on the landing page lists a
  signed-in user's saved characters, most recently updated first.
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

- **Design**: laid out as an old-school scrapbook collage — polaroid-style photo frames at
  slightly different sizes and rotation angles, "pinned" to a dot-grid corkboard, rather than
  an aligned grid. Each photo's size, rotation, and pin color are derived from a hash of the
  character's name, so the scatter looks hand-placed but stays put across page reloads.
- **Scales without hammering the database**: paginated (`GET /api/chars?limit=&offset=`) and
  backed by a 60-second in-process cache, so a burst of visitors scrolling through hundreds of
  portraits costs at most one database query per minute, not one per page of results.
- **Click a portrait to open it full-size** in a native `<dialog>` lightbox, with a "Chat with
  this character" button that launches straight into a conversation — resuming your own saved
  version of that character if you're signed in and already created one, or generating a fresh
  one otherwise. It's the same landing-page launch path as typing a name in yourself, just
  skipping straight past the form.
- **Abusive names never reach this page**: every name is checked for profane/abusive content
  as part of the same Claude-powered validation round-trip that screens for copyright
  concerns, before a character (and its portrait) can be created at all. Unlike a copyright
  warning, there's no "Continue Anyway" for this check.

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

**Important**: Never store secrets or PII in client storage. All data is client-side only.

## Troubleshooting

### Hydration Mismatch Warning

React hydration warnings from browser extensions (e.g., Dark Reader) are expected. The root `<html>` element has `suppressHydrationWarning` enabled. Disable browser extensions during development if needed.

### TTS Errors

Ensure `GOOGLE_APPLICATION_CREDENTIALS_JSON` is set correctly and the service account has Text-to-Speech API enabled.

### Streaming Issues

Check browser console for SSE connection errors. Ensure the API endpoint isn't being blocked by corporate firewalls.

## Contributing

PRs welcome! Please include:

- Tests for new features
- Updated documentation
- Follow existing code style
- Run `npm run lint` before submitting

## License & Disclaimer

Educational/portfolio project. Not affiliated with Anthropic or Google.

**Copyright Notice**: This app includes AI-powered copyright/trademark validation to help users avoid creating chatbots based on copyrighted or trademarked characters. When a potentially copyrighted character is detected, users receive warnings and suggestions for public domain alternatives. Users are solely responsible for ensuring their use complies with applicable copyright and trademark laws. The validation system provides guidance but does not constitute legal advice.

## Agent Instructions

Agent-focused instructions live at `./.github/copilot-instructions.md` and cover setup, security, streaming/TTS patterns, and critical files to read before changing core behavior.
