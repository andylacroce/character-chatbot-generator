# Character Chatbot Generator

A Next.js app featuring a real-time chat interface, character personas, and voice responses via Google Text-to-Speech.

## Features

- Voice responses via Google TTS
- Chat powered by OpenAI's ChatGPT
- Built with Next.js & React
- TypeScript throughout
- Comprehensive Jest test suite
- Responsive, accessible design
- Downloadable chat transcripts
- Logging to Vercel Blob or local file system
- **All internal API endpoints are public by default**

## How it Works

1. **Character Creation**: Users create a chatbot persona by entering a name or choosing a random character. The app generates a personality, avatar, and voice configuration.
2. **Chat**: Users chat in real time. The app sends messages to OpenAI's API, receives characterful replies, and synthesizes voice responses using Google TTS.
3. **Transcript & Logging**: Users can download chat transcripts. All chats can be logged to Vercel Blob or the local file system.

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

3. **Update Middleware for Custom Domains or Ports**

   - The file `middleware.ts` restricts API access to specific origins for security.
   - If you run the app locally on a different port, domain, or deploy to a different Vercel project, you must update the `allowedOrigins` array in `middleware.ts` to include your new URL(s).
   - Example:
     ```ts
     const allowedOrigins = [
         'http://localhost:3000',
         'http://127.0.0.1:3000',
         'https://your-custom-domain.com', // Add your domain here
     ];
     ```
   - Without this update, API requests from your environment will be blocked with a 403 Forbidden error.

4. **Run Locally**

   ```bash
   npm run dev
   ```
   
5. **Run Tests**
   ```bash
   npm test
   ```
   - API endpoint tests automatically mock required environment variables.
   - All internal API endpoints are tested for public access.

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
