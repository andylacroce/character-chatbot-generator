# character-chatbot-shared

Shared TypeScript types, input-sanitization functions, and client-storage key
constants used by both `character-chatbot-generator` (the Next.js web app /
backend) and `character-chatbot-mobile` (the React Native client).

Not published to npm — both consumers install it directly from this git repo,
which triggers an automatic `tsc` build (via the `prepare` script) on install:

```json
"dependencies": {
  "character-chatbot-shared": "git+https://github.com/andylacroce/character-chatbot-shared.git"
}
```

## What belongs here

- **API contract types** (`src/types.ts`) — request/response shapes for the
  backend's `pages/api/*` routes. These mirror each route's `@swagger` JSDoc
  block in the web repo; update both together when a contract changes.
- **Input sanitization** (`src/validation.ts`) — client-side copies of the
  same rules the server enforces authoritatively (`src/utils/security.ts` in
  the web repo). These exist for UX (instant feedback), not security — the
  server never trusts the client's sanitized value.
- **Storage key constants** (`src/storageKeys.ts`) — key name strings shared
  between the web app's `localStorage` and the mobile app's `AsyncStorage`.

## What doesn't belong here

Anything that touches a platform API (DOM, Node, React Native modules), or any
UI/rendering code — there's no shared rendering layer between Next.js/React
DOM and React Native.

## Development

```
npm install
npm test    # jest
npm run build  # tsc -> dist/
```
