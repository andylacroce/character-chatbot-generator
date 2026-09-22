# character-chatbot-mobile

Android/iOS client for [character-chatbot-generator](https://github.com/andylacroce/character-chatbot-generator)
(Portrayal), built with Expo (React Native) + TypeScript. This is a pure API
client — all chat, personality, avatar, and validation logic lives in the
existing Next.js backend; this app only renders it natively and calls it over
HTTPS.

## Features

- **Create a character**: name a person, real or fictional, and the backend
  generates their personality, portrait, and voice — same pipeline as the web
  app, including copyright/trademark validation and an original-character
  description flow for names it doesn't recognize.
- **Chat**: text conversation with Claude-powered replies and Google
  Text-to-Speech audio playback (`expo-audio`), with history persisted locally.
- **Character Wall**: browse every character the app has ever generated and
  jump straight into a chat with one.
- **Light/dark theming**, a resumable "continue chatting" shortcut for the
  last character used, and a rotating landing-page carousel of characters.
- **Guest-only for now** — no accounts yet (see Roadmap in `CLAUDE.md`).

## Prerequisites

- Node.js ≥ 18
- A running deployment of [character-chatbot-generator](https://github.com/andylacroce/character-chatbot-generator)
  to point this app at (or `localhost` via a tunnel/device on the same network)
- [Expo Go](https://expo.dev/go) on a physical device, or an Android
  emulator / iOS simulator, for local testing

## Setup

```bash
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_API_SECRET — see .env.example
npm start
```

Scan the QR code with Expo Go (or press `a`/`i` for an emulator/simulator).

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run android` / `npm run ios` | Start the dev server and open on Android/iOS |
| `npm run web` | Dev-only browser preview via `react-native-web` (not a shipping target — network calls will hit the backend's CORS wall; only layout/navigation are testable this way) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run lint:md` | markdownlint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run type-check` | `tsc --noEmit` |
| `npm run ci` | The composite check CI runs: lint → lint:md → format:check → type-check |

## Project structure

```text
App.tsx                 # Navigation stack, theme provider, status bar
src/
  screens/               # CreatorScreen, ChatScreen, CharWallScreen
  components/            # Modals, carousel, wordmark, avatar, lightbox
  api.ts                 # Backend HTTP calls
  botCreation.ts          # Shared personality -> avatar -> voice pipeline
  storage.ts             # AsyncStorage persistence (history, saved bot, prefs)
  theme.ts, ThemeContext.tsx  # Re-exports character-chatbot-shared's theme + light/dark switch
  navigation/types.ts     # Typed stack param list
```

Shared TypeScript types, brand colors/copy, and input-sanitization rules live
in a separate repo, [character-chatbot-shared](https://github.com/andylacroce/character-chatbot-shared),
consumed as a git dependency — not duplicated here.

## Architecture notes

`CLAUDE.md` in this repo has the full picture: why this is a separate repo
from the web app, the shared-package split, known tradeoffs (e.g. the API key
being bundled into the JS), what's deferred to a later phase, and the story
behind a few non-obvious fixes (Android keyboard-avoidance under Expo's
edge-to-edge default, in particular). Worth a skim before making architectural
changes.
