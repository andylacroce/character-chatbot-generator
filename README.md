# Character Chatbot Generator

A Next.js + TypeScript app that provides a character-driven chat UI with OpenAI-powered responses and Google Text-to-Speech audio replies.

## Key Features

- **Advanced OpenAI Integration**: Uses gpt-4o with streaming responses, conversation summarization, and prompt caching
- **Voice Responses**: Google Text-to-Speech API with character-specific voice configurations
- **Structured Outputs**: JSON Schema validation for reliable avatar generation
- **Smart Context Management**: Automatic conversation summarization when history exceeds 50 messages
- **Cost Optimization**: Prompt caching reduces API costs for repeated system prompts
- **Real-time Streaming**: Server-Sent Events (SSE) for live response delivery
- **Comprehensive Testing**: Jest test suite with 91%+ code coverage
- **API Security**: Protected endpoints with origin validation and API key authentication
- **Responsive Design**: Mobile-friendly UI with dark mode support

## OpenAI Features

This app leverages the latest OpenAI API capabilities:

- **gpt-4o Model**: 128K context window, faster responses, more cost-effective
- **Streaming Responses**: Real-time message delivery via Server-Sent Events
- **Structured Outputs**: JSON Schema with strict mode for avatar generation
- **Prompt Caching**: Reduces costs by caching repeated system prompts
- **Conversation Summarization**: Maintains context beyond 50 messages automatically

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

2. **Environment Setup**

Create `.env.local` at project root with required secrets:

```ini
OPENAI_API_KEY=sk-...
API_SECRET=your_server_api_secret
GOOGLE_APPLICATION_CREDENTIALS_JSON=config/gcp-key.json
# Optional:
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_token
TTS_TMP_DIR=/custom/temp/path
```

3. **Google Cloud Setup**

   - Create a GCP service account with Text-to-Speech API access
   - Download the JSON key file
   - Place it at `config/gcp-key.json` or paste contents into `GOOGLE_APPLICATION_CREDENTIALS_JSON`

4. **Start Development Server**:

```powershell
npm run dev
```

Visit `http://localhost:3000`

## Testing

Run the full test suite with coverage:

```powershell
npm run test:coverage
```

Run linting:

```powershell
npm run lint
```

## Environment Variables

### Required

- `OPENAI_API_KEY` — OpenAI API key for chat generation (gpt-4o)
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

## Project Structure

```
app/                  # Next.js app & UI components
pages/api/           # API routes (chat, audio, health, transcript)
  chat.ts            # Main chat endpoint with streaming & summarization
  audio.ts           # TTS audio generation
  generate-avatar.ts # Avatar generation with structured outputs
src/
  utils/             # Utilities (TTS, logger, cache, security)
  types/             # TypeScript type definitions
  config/            # Configuration files
tests/               # Jest test suite
proxy.ts             # API authentication middleware (Next.js 16)
```

## How It Works

1. **Character Creation**: 
   - Enter a name or generate a random character
   - App creates personality, avatar (DALL-E), and voice configuration
   - Uses structured outputs with JSON Schema validation

2. **Chat Interface**:
   - Real-time streaming responses via Server-Sent Events
   - Automatic conversation summarization for long chats (>50 messages)
   - Prompt caching reduces API costs for repeated prompts
   - Character-specific voice synthesis with Google TTS

3. **Transcripts**: 
   - Clean HTML format with character avatars
   - Opens in new browser tab
   - Compatible with all modern browsers

## Deployment (Vercel)

1. **Environment Variables**

   Set these in Vercel Project Settings:
   - `OPENAI_API_KEY`
   - `API_SECRET`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` (paste full JSON content)
   - `VERCEL_BLOB_READ_WRITE_TOKEN` (optional)

2. **Runtime Configuration**

   - Use Node.js runtime (not Edge) for API routes
   - Node version ≥18 recommended
   - Next.js 16.0.0+ with Turbopack support

3. **Custom Domains**

   Update `allowedOrigins` in `proxy.ts` to include your custom domain.

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

Educational/portfolio project. Not affiliated with OpenAI or Google. Use public domain characters only.
