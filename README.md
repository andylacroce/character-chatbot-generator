# Character Chatbot Generator

A Next.js app featuring a real-time chat interface, character personas, and voice responses via Google Text-to-Speech.

## Features

- Voice responses via Google TTS
- Chat powered by OpenAI's ChatGPT
- Built with Next.js & React
- TypeScript throughout
- **Robust rate limiting for API protection**
- Comprehensive Jest test suite
- Responsive, accessible design
- Downloadable chat transcripts
- Logging to Vercel Blob or local file system
- **All internal API endpoints are public by default**

## How it Works

1. **Character Creation**: Users create a chatbot persona by entering a name or choosing a random character. The app generates a personality, avatar, and voice configuration.
2. **Chat**: Users chat in real time. The app sends messages to OpenAI's API, receives characterful replies, and synthesizes voice responses using Google TTS.
3. **Transcript & Logging**: Users can download chat transcripts. All chats can be logged to Vercel Blob or the local file system.
4. **API Rate Limiting**: All API endpoints are protected by a rate limiter to prevent abuse.

## API Rate Limiting

All API endpoints are protected by a rate limiter middleware:

- **Limits each IP to 100 requests per 15 minutes** (configurable)
- Responds with HTTP 429 and logs the event if the limit is exceeded
- Sets the following headers on all responses:
  - `X-RateLimit-Limit`: Maximum requests allowed per window
  - `X-RateLimit-Remaining`: Requests remaining in the current window
  - `X-RateLimit-Reset`: Unix timestamp (seconds) when the window resets
  - `Retry-After`: (on 429) Seconds until the next allowed request

## Setup

1. **Clone & Install**
   ```bash
   git clone https://github.com/andylacroce/character-chatbot-generator.git
   cd character-chatbot-generator
   npm install
   ```
2. **Environment Variables**

   - Create `.env.local`:
     ```ini
     OPENAI_API_KEY=your_openai_api_key_here
     GOOGLE_APPLICATION_CREDENTIALS_JSON=config/gcp-key.json
     VERCEL_BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here
     ```
   - For Vercel, paste the full JSON string for `GOOGLE_APPLICATION_CREDENTIALS_JSON` and your `VERCEL_BLOB_READ_WRITE_TOKEN` in the dashboard.

   - **Vercel Blob Setup:**
     - This app can log chat transcripts and other data to Vercel Blob storage.
     - To enable this, you must set the `VERCEL_BLOB_READ_WRITE_TOKEN` environment variable with a valid token from your Vercel project settings.
     - See the [Vercel Blob documentation](https://vercel.com/docs/storage/vercel-blob/quickstart) for details on generating a token and managing Blob storage.

3. **Run Locally**

   ```bash
   npm run dev
   ```

4. **Run Tests**
   ```bash
   npm test
   ```
   - API endpoint tests automatically mock required environment variables.
   - All internal API endpoints are tested for public access and rate limiting.

## Project Structure

- `app/` - Next.js app & components
- `pages/api/` - API routes (chat, logging, health, transcript, audio)
- `src/` - Middleware, types, utilities (TTS, logger, cache, etc.)
- `tests/` - Test files for API, components, and utilities

## Documentation

- API and utility documentation is generated using TypeDoc and JSDoc comments.
- The generated HTML docs in `docs/` are not committed to git (see `.gitignore`).
- To generate documentation for the entire project locally, run:
  ```bash
  npx typedoc --out docs .
  ```
  Then open `docs/index.html` in your browser.

## Code Documentation & Best Practices

- All main API routes and utilities are documented with JSDoc comments for clarity and maintainability.
- JSDoc is used to describe function parameters, return values, and usage. See source files in `src/utils/` and `pages/api/` for examples.
- TypeScript types are used throughout for safety and editor support.
- Follow best practices for code comments and documentation. See [JSDoc guide](https://jsdoc.app/) for more info.

## Contributing

Contributions are welcome! Please:
- Open an issue for bugs or feature requests
- Submit pull requests with clear descriptions and relevant tests
- Follow the existing code style and documentation practices

## License

NA
