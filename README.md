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

## Setup (local)

1. **Clone & install**
   ```bash
   git clone https://github.com/andylacroce/character-chatbot-generator.git
   cd character-chatbot-generator
   npm install
   ```

2. **Environment variables**

   - Create `.env.local` for local development (example):

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

- **Local**: Set `GOOGLE_APPLICATION_CREDENTIALS_JSON` to your service account JSON file path
- **Vercel**: Paste the full JSON string into the `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable

## Contributing

Open issues for bugs/features. Submit PRs with tests. Follow existing code style.

## Disclaimer

Educational/portfolio project. Use public domain characters only. Not affiliated with OpenAI.

## Troubleshooting

### Hydration Mismatch Warning

If you see a React hydration mismatch error in development pointing to attributes like `data-darkreader-mode` (from browser extensions like Dark Reader), this is expected. The root `<html>` element has `suppressHydrationWarning` to reduce noisy warnings. For a permanent fix, disable browser extensions that modify HTML during development.
