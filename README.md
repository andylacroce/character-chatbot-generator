# Character Chatbot Generator

A Next.js app featuring a real-time chat interface, character personas, and voice responses via Google Text-to-Speech.

## Features

- Voice responses via Google TTS
- Chat powered by OpenAI's ChatGPT
- Built with Next.js & React
- TypeScript throughout
- Comprehensive Jest test suite
- Responsive, accessible design
- HTML chat transcripts with character images (opens in new tabs)
- Logging to Vercel Blob or local file system
- **API Security**: All internal API endpoints are protected by API key authentication and origin restrictions

## Project structure

- `app/` - Next.js app & components
- `pages/api/` - API routes (chat, logging, health, transcript, audio)
- `src/` - Middleware, types, utilities (TTS, logger, cache, etc.)
- `tests/` - Test files for API, components, and utilities

## How it works

1. **Character Creation**: Enter a name or choose a random character. The app generates a personality, avatar, and voice configuration.
2. **Chat**: Real-time chat powered by OpenAI with characterful responses and Google TTS voice synthesis.
3. **Transcripts**: View formatted HTML transcripts with character images in new browser tabs.

## Transcript Feature

Clean HTML transcripts with character avatars that open in new browser tabs. Compatible with all modern browsers.

## Prerequisites

- Node.js ≥18
- npm or yarn

## Setup (local)

1. **Clone & install**
   ```bash
   git clone https://github.com/andylacroce/character-chatbot-generator.git
   cd character-chatbot-generator
   npm install
   ```

2. **Environment variables**

   - Copy the example environment file and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

   Required environment variables in `.env.local`:

   ```ini
   OPENAI_API_KEY=your_openai_api_key_here
   GOOGLE_APPLICATION_CREDENTIALS_JSON=config/gcp-key.json
   VERCEL_BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here
   API_SECRET=your_api_secret_here
   ```

3. **API Security**

   Multi-layered protection with origin restrictions and API key authentication:
   - Requests from allowed origins (localhost, production Vercel, preview deployments) are automatically authenticated
   - Requests from external origins require valid `x-api-key` headers
   - All `/api/*` endpoints are protected by middleware
   - Failed attempts are logged for monitoring

   **Required Environment Variables**:
   - `API_SECRET`: Server-side API key (used for external API access)

   **Custom Domains**: Update `allowedOrigins` in `middleware.ts` for non-standard deployments.

4. **Run locally**

   ```bash
   npm run dev
   ```

5. **Run tests**

   ```bash
   npm test
   ```

## Testing

Run tests with `npm test`. The project includes a UUID mock for deterministic testing.

## Deployment (Vercel)

Set these environment variables in Vercel Project Settings:
- `OPENAI_API_KEY`
- `VERCEL_BLOB_READ_WRITE_TOKEN` (optional)
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `API_SECRET`

Use Node runtime (not Edge) for API routes. Node version ≥18 recommended.

### Google Cloud Setup

1. Create a Google Cloud service account with Text-to-Speech API access
2. Download the JSON key file
3. For local development: Place the JSON file at `config/gcp-key.json` (or update the path in `.env.local`)
4. For Vercel deployment: Paste the full JSON content as a string in the `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable

## Contributing

Open issues for bugs/features. Submit PRs with tests. Follow existing code style.

## Disclaimer

Educational/portfolio project. Use public domain characters only. Not affiliated with OpenAI.

## Troubleshooting

### Hydration Mismatch Warning

If you see a React hydration mismatch error in development pointing to attributes like `data-darkreader-mode` (from browser extensions like Dark Reader), this is expected. The root `<html>` element has `suppressHydrationWarning` to reduce noisy warnings. For a permanent fix, disable browser extensions that modify HTML during development.

## Storage (client-side)

This project uses a small safe storage wrapper at `src/utils/storage.ts` that centralizes access to `localStorage` and provides an in-memory fallback for environments (like tests) where `localStorage` is unavailable. Use the helper instead of direct `localStorage` reads/writes.

Important notes:
- Voice configurations are stored versioned under `voiceConfig-<bot.name>` as an object: `{ v: 1, createdAt: ISO, payload: { ...voiceConfig } }`.
- Other keys used: `chatbot-bot`, `chatbot-bot-timestamp`, `chatbot-history-<bot.name>`, `lastPlayedAudioHash-<bot.name>`, `audioEnabled`, `darkMode`, `bot-session-id`, `bot-session-datetime`.
- Do not store secrets or sensitive PII in client-side storage.
- If you need cross-device sync later, implement an authenticated server-side backup; for now localStorage provides durable client-side persistence independent of server runtime.

If you change the shape of stored objects, bump the version (`v`) to allow migration logic to detect and transform older entries.
