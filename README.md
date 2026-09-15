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
- **Brand tokens** (`src/theme.ts`) — light/dark color palettes (mirrors the web
  app's `app/globals.css`/`app/darkmode.css`) and wordmark/copy strings (mirrors
  `BotCreator.tsx`'s hero section). The web app doesn't consume these yet — it
  still hand-maintains its own CSS copies; keep both in sync by eye until/unless
  it migrates to generate its CSS from here.

**Tried and reverted:** a `src/icons.ts` with hand-drawn icon path data (extracted
from the web app's `ChatInput.tsx` inline SVGs), meant to be rendered via
`react-native-svg` on mobile for pixel-identical glyphs. Even after two rounds of
fixes (splitting a compound multi-subpath `<Path>` into simple ones, ruling out
several other theories), the mobile client's send button still failed to render
reliably on a real Android device — not reproducible in any preview. Removed
rather than keep chasing it; mobile now uses `@expo/vector-icons` (a different,
merely similar-looking glyph) for those icons instead. If revisiting true
cross-platform icon sharing, treat this as a known-hard problem, not a quick add.

## What doesn't belong here

Anything that touches a platform API (DOM, Node, React Native modules), or any
UI/rendering code — there's no shared rendering layer between Next.js/React
DOM and React Native.

## Development

```bash
npm install
npm test    # jest
npm run build  # tsc -> dist/
```
