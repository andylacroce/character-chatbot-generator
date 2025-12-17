## Project Structure

```text
app/
   components/        # React components & hooks
      CopyrightWarningModal.tsx  # Warning modal for copyrighted characters
      useBotCreation.ts          # Bot creation with validation flow
pages/api/           # API routes (chat, audio, health, transcript)
   chat.ts            # Main chat endpoint with streaming & summarization
   audio.ts           # TTS audio generation
   generate-avatar.ts # Avatar generation with structured outputs
   validate-character.ts # Copyright/trademark validation
   random-character.ts   # Public domain character suggestions
src/
   utils/             # Utilities (TTS, logger, cache, security)
   types/             # TypeScript type definitions
   config/            # Configuration files
tests/               # Jest test suite (80%+ branch coverage)
proxy.ts             # API authentication middleware (Next.js 16)
```

App creates personality, avatar (OpenAI image models — production uses `gpt-image-1.5`, non-production uses `gpt-image-1-mini`; fallbacks include `dall-e-3`), and voice configuration

# Character Chatbot Generator

A Next.js 16 + TypeScript app that provides a character-driven chat UI with OpenAI-powered responses and Google Text-to-Speech audio replies.

## Key Features

- **Advanced OpenAI Integration**: Uses gpt-4o (production) / gpt-4o-mini (dev) with streaming responses, conversation summarization, and prompt caching
- **Copyright Protection**: AI-powered character validation with copyright/trademark detection and public domain suggestions
- **Voice Responses**: Google Text-to-Speech API with character-specific voice configurations
- **Structured Outputs**: JSON Schema validation for reliable avatar generation
- **Smart Context Management**: Automatic conversation summarization when history exceeds 50 messages
- **Cost Optimization**: Prompt caching reduces API costs for repeated system prompts
- **Real-time Streaming**: Server-Sent Events (SSE) for live response delivery
- **Comprehensive Testing**: Jest test suite with 80%+ branch coverage and 351 passing tests
- **API Security**: Protected endpoints with origin validation and API key authentication
- **Responsive Design**: Mobile-friendly UI with dark mode support

## OpenAI Features

This app leverages the latest OpenAI API capabilities:

- **gpt-4o Model**: Production uses OpenAI's flagship model for best conversational quality and fluency (128K context window)
- **gpt-4o-mini Model**: Development uses the faster, cheaper variant for cost-effective testing
- **Streaming Responses**: Real-time message delivery via Server-Sent Events
- **Structured Outputs**: JSON Schema with strict mode for avatar generation
- **Prompt Caching**: Reduces costs by caching repeated system prompts
- **Conversation Summarization**: Maintains context beyond 50 messages automatically
- **Smart Continuation**: Detects truncated responses and allows seamless story continuation

## Prerequisites

- Node.js ≥18
- npm or yarn
- OpenAI API key
- Google Cloud service account with Text-to-Speech API access

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
OPENAI_API_KEY=sk-...
API_SECRET=your_server_api_secret
GOOGLE_APPLICATION_CREDENTIALS_JSON=config/gcp-key.json
# Optional:
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_token
TTS_TMP_DIR=/custom/temp/path
```

1. **Google Cloud Setup**

   - Create a GCP service account with Text-to-Speech API access
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

- `OPENAI_API_KEY` — OpenAI API key for chat generation (gpt-4o in production, gpt-4o-mini in dev)
- `API_SECRET` — Server-side API secret for request authorization
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — Path to GCP JSON key or full JSON content

### Optional

- `VERCEL_BLOB_READ_WRITE_TOKEN` — Enables logging to Vercel Blob storage
- `TTS_TMP_DIR` — Custom path for temporary TTS files (defaults to system temp)

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

Educational/portfolio project. Not affiliated with OpenAI or Google.

**Copyright Notice**: This app includes AI-powered copyright/trademark validation to help users avoid creating chatbots based on copyrighted or trademarked characters. When a potentially copyrighted character is detected, users receive warnings and suggestions for public domain alternatives. Users are solely responsible for ensuring their use complies with applicable copyright and trademark laws. The validation system provides guidance but does not constitute legal advice.

## Agent Instructions

Agent-focused instructions live at `./.github/copilot-instructions.md` and cover setup, security, streaming/TTS patterns, and critical files to read before changing core behavior.
