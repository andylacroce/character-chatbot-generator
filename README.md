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
- **All internal API endpoints are public by default**

## Project structure

- `app/` - Next.js app & components
- `pages/api/` - API routes (chat, logging, health, transcript, audio)
- `src/` - Middleware, types, utilities (TTS, logger, cache, etc.)
- `tests/` - Test files for API, components, and utilities

## How it works

1. **Character Creation**: Users create a chatbot persona by entering a name or choosing a random character. The app generates a personality, avatar, and voice configuration.

   **Direct Character Creation via URL**: You can also create a character directly by including a `name` query parameter in the URL. For example: `https://your-domain.com/?name=Sherlock%20Holmes`. This will:
   - Load the character creation page (even if a character already exists)
   - Prepopulate the name field with the specified character
   - Automatically start generating the character

2. **Chat**: Users chat in real time. The app sends messages to OpenAI's API, receives characterful replies, and synthesizes voice responses using Google TTS.
3. **Transcript & Logging**: Users can view chat transcripts as formatted HTML pages with character images in new browser tabs. All chats can be logged to Vercel Blob or the local file system.

## Transcript Feature

The app provides a rich HTML transcript feature that opens in new browser tabs:

- **Format**: Clean HTML with responsive styling and character avatars
- **Access**: Click the transcript button in the chat header to open in a new tab
- **Filename**: Browser tab title shows "{Character Name} transcript {datetime}"
- **Content**: Includes all chat messages with proper formatting and character images
- **Browser Compatibility**: Works on all modern browsers (may be blocked by popup blockers)

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
   ```

   - For Vercel, paste the full JSON string for `GOOGLE_APPLICATION_CREDENTIALS_JSON` and your `VERCEL_BLOB_READ_WRITE_TOKEN` in the Project Settings (see "Deployment" notes below).

3. **Middleware / CORS**

   - The file `middleware.ts` restricts API access to specific origins for security. If you run the app locally on a different port/domain or deploy to another Vercel project, update the `allowedOrigins` array in `middleware.ts`.

   Example:

   ```ts
   const allowedOrigins = [
     'http://localhost:3000',
     'http://127.0.0.1:3000',
     'https://your-custom-domain.com',
   ];
   ```

4. **Run locally**

   ```bash
   npm run dev
   ```

5. **Run tests**

   ```bash
   npm test
   ```

## Testing notes

- The project includes a small manual Jest mock for the `uuid` package at `__mocks__/uuid.js`.
  - Why: `uuid@13+` is ESM and contains `export` syntax. Transforming ESM node_modules can complicate Jest/Babel config. The mock is a small CommonJS-compatible shim used only for tests to keep them deterministic.
  - How to remove the mock:
    1. Configure Babel/Jest to transform `uuid` (the project already whitelists `uuid` in `transformIgnorePatterns`, but you may need to tweak Babel), or
    2. Pin `uuid` to a CJS-compatible release (not recommended), or
    3. Replace the mock with a test helper that uses a CJS-safe UUID generator.

## Deployment (Vercel)

- This app runs on Vercel. Provide secrets via Project Settings (Environment Variables):
  - `OPENAI_API_KEY`
  - `VERCEL_BLOB_READ_WRITE_TOKEN` (if using Vercel Blob)
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` — paste the full service-account JSON as a secret (do not commit `config/gcp-key.json`)
- Ensure server-side API routes that use Node-only SDKs (Google client libraries) are not configured as Edge functions (use the default Node runtime).
- Set a Node engine (>=18) in `package.json` or in Vercel settings if needed.

## Contributing

Contributions are welcome! Please:
- Open an issue for bugs or feature requests
- Submit pull requests with clear descriptions and relevant tests
- Follow the existing code style and documentation practices

## Disclaimer

This project is a demonstration of using the OpenAI API to generate chatbots. It is intended solely for educational and portfolio purposes. Users are responsible for any content they generate. Do not use this tool to create or distribute chatbots based on copyrighted or trademarked characters. Instead, we encourage creating chatbots based on public domain characters (such as those from classic literature like Sherlock Holmes, Dracula, or Alice in Wonderland) or completely original characters. This project is not affiliated with or endorsed by OpenAI or any third-party rights holders.
