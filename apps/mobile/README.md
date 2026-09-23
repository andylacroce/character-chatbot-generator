# character-chatbot-mobile

Android/iOS client for Portrayal, built with Expo (React Native) + TypeScript. It
lives in the character-chatbot-generator monorepo (`apps/mobile`) and is a pure
API client: chat, personality, avatar, and validation logic run in the Next.js
backend at the repo root, and this app renders them natively over HTTPS.

## Features

- **Create a character**: name a person, real or fictional, and the backend
  generates their personality, portrait, and voice — same pipeline as the web
  app, including copyright/trademark validation and an original-character
  description flow for names it doesn't recognize.
- **Chat**: text conversation with Claude-powered replies and Google
  Text-to-Speech audio playback (`expo-audio`), with history persisted locally.
  Tap the speaker next to any character message to hear it again.
- **Character Wall**: browse every character the app has ever generated and
  jump straight into a chat with one.
- **Guessing game and leaderboard**: the same chain-of-characters game as the
  web app's `/game`, plus the public top-ten leaderboard.
- **Optional Google sign-in**: saves your characters and chat history to your
  account, and lists them under Past chats.
- **Light/dark theming**, a resumable "continue chatting" shortcut for the
  last character used, and a rotating landing-page carousel of characters.

## Prerequisites

- Node.js ≥ 18
- A running deployment of [character-chatbot-generator](https://github.com/andylacroce/character-chatbot-generator)
  to point this app at (or `localhost` via a tunnel/device on the same network)
- [Expo Go](https://expo.dev/go) on a physical device, or an Android
  emulator / iOS simulator, for local testing

## Setup

```bash
npm install            # from the repo root; npm workspaces link packages/shared
cp .env.example .env
# fill in EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_API_SECRET — see .env.example
npm start
```

Scan the QR code with Expo Go (or press `a`/`i` for an emulator/simulator).

To test against a local `npm run dev` backend from the Android emulator, forward
both ports and point the app at `localhost`:

```bash
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 EXPO_PUBLIC_API_SECRET=<API_SECRET from ../../.env.local> npx expo start --android
```

`10.0.2.2` doesn't work for this: the backend only accepts keyless GETs (e.g. the
carousel) from first-party hosts. An adb reconnect drops both forwards, which
shows up as a "Cannot connect to Expo CLI" toast and failed API calls; re-run
the two `adb reverse` commands.

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
| `npm test` / `npm run test:watch` | Jest + React Native Testing Library |
| `npm run test:coverage` | Jest with the 80% global coverage gate |
| `npm run ci` | The composite check CI runs: lint → lint:md → format:check → type-check → test:coverage |

## Project structure

```text
App.tsx                 # Navigation stack, theme provider, status bar
src/
  screens/               # Creator, Chat, CharWall, History, Game, Leaderboard
  components/            # ChatView, modals, carousel, header title, wordmark, avatar, lightbox
  api.ts                 # Backend HTTP calls
  botCreation.ts         # mobileTransport: this app's adapter for the shared creation pipeline
  useGameController.ts   # Wraps the shared useGameSession with AsyncStorage + native audio
  useReplyAudio.ts       # TTS playback, replay, and the persisted mute toggle
  AuthContext.tsx, auth.ts, authToken.ts  # Optional Google sign-in via the backend's mobile bridge
  storage.ts             # AsyncStorage persistence (history, saved bot, prefs)
  theme.ts, ThemeContext.tsx  # Re-exports character-chatbot-shared's theme + light/dark switch
  navigation/types.ts     # Typed stack param list
```

Shared types, copy, storage keys, validation, and client state machines
(character creation, the guessing game, the carousel) live in `packages/shared`
(`character-chatbot-shared`), an npm workspace that the web app imports too.
This app supplies only thin adapters: transport, storage, and native audio.

## Architecture notes

`CLAUDE.md` in this directory has the full picture: the shared-package split, known tradeoffs (e.g. the API key
being bundled into the JS), what's deferred to a later phase, and the story
behind a few non-obvious fixes (Android keyboard-avoidance under Expo's
edge-to-edge default, in particular). Worth a skim before making architectural
changes.
