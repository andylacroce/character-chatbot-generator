## Project Structure

```text
app/
   components/        # React components & hooks
      CopyrightWarningModal.tsx  # Warning modal for copyrighted characters
      useBotCreation.ts          # Bot creation with validation flow
pages/api/           # API routes (chat, audio, health, transcript)
   chat.ts            # Main chat endpoint with streaming & summarization
   audio.ts           # TTS audio generation
   generate-avatar.ts # Avatar generation via Claude + Vertex AI Imagen
   validate-character.ts # Copyright/trademark validation
   random-character.ts   # Public domain character suggestions
src/
   utils/             # Utilities (TTS, logger, cache, security)
   types/             # TypeScript type definitions
   config/            # Configuration files
tests/               # Jest test suite (80%+ branch coverage)
proxy.ts             # API authentication middleware (Next.js 16)
```

# Character Chatbot Generator

A Next.js 16 + TypeScript app that provides a character-driven chat UI with Claude-powered responses and Google Text-to-Speech audio replies.

## Key Features

- **Claude AI Integration**: Uses claude-sonnet-4-6 (production chat) / claude-haiku-4-5-20251001 (dev + simple tasks) with streaming responses and conversation summarization
- **Copyright Protection**: AI-powered character validation with copyright/trademark detection and public domain suggestions
- **Voice Responses**: Google Text-to-Speech API with character-specific voice configurations
- **Avatar Generation**: Claude generates a detailed image prompt; Google Vertex AI Imagen (`imagen-3.0-fast-generate-001`) renders a portrait and returns it as a base64 data URL
- **Smart Context Management**: Automatic conversation summarization when history exceeds 50 messages
- **Real-time Streaming**: Server-Sent Events (SSE) for live response delivery
- **Comprehensive Testing**: Jest test suite with 80%+ branch coverage and 592 passing tests
- **API Security**: Protected endpoints with origin validation and API key authentication
- **Responsive Design**: Mobile-friendly UI with dark mode support

## Prerequisites

- Node.js ≥18
- npm or yarn
- Anthropic API key
- Google Cloud service account with Text-to-Speech and Vertex AI APIs enabled

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
```

1. **Google Cloud Setup**

   - Create a GCP service account with Text-to-Speech and Vertex AI APIs enabled
   - Grant the service account the `roles/aiplatform.user` role for Imagen
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

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` — Anthropic API key for chat and avatar prompt generation
- `API_SECRET` — Server-side API secret for request authorization
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — Path to GCP JSON key or full JSON content
- `GOOGLE_CLOUD_PROJECT` — GCP project ID for Vertex AI Imagen

### Optional

- `VERCEL_BLOB_READ_WRITE_TOKEN` — Enables logging to Vercel Blob storage
- `TTS_TMP_DIR` — Custom path for temporary TTS files (defaults to system temp)

## Avatar Generation

When a character chatbot is created, the app generates a portrait avatar automatically:

1. **Prompt generation** — Claude (`claude-haiku-4-5-20251001`) receives the character name and produces a detailed, safe-for-work image prompt describing appearance, era, and artistic style.
2. **Image rendering** — The prompt is sent to Google Vertex AI Imagen (`imagen-3.0-fast-generate-001`) which returns a 512 × 512 PNG as a base64 data URL.
3. **Display** — The data URL is rendered directly in the UI; no external image hosting is required.

### Requirements

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` must reference a service account with `roles/aiplatform.user` granted in the GCP project.
- `GOOGLE_CLOUD_PROJECT` must be set to the project where the Vertex AI API is enabled.
- The `aiplatform.googleapis.com` API must be enabled in that project.

### Rate limit

Avatar generation is capped at **5 requests per minute per IP** because Imagen calls are relatively expensive compared to text inference.

## API Security

Multi-layered protection for all API endpoints:

- **Origin Validation**: Automatic authentication for localhost, Vercel production, and preview deployments
- **API Key Authentication**: External origins require valid `x-api-key` header matching `API_SECRET`
- **Route Protection**: All `/api/*` endpoints secured via proxy middleware
- **Request Logging**: Failed authentication attempts logged for monitoring

**Custom Domains**: Update `allowedOrigins` in `proxy.ts` when deploying to custom domains.

## Storage (Client-Side)

Uses safe storage wrapper at `src/utils/storage.ts` with localStorage and in-memory fallback.

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
