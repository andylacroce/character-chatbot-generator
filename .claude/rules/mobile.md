---
paths:
  - "apps/mobile/**"
---

## Mobile app (`apps/mobile`)

Android/iOS Expo client for this same backend (folded into the monorepo in v0.6.1 with history
preserved; the old standalone mobile/shared repos are deleted). It is a pure API client: no
server code lives in it, and it must never reimplement backend logic, only call it. It still
deploys independently of the web app (Expo/EAS, not Vercel). Read the versioned Expo docs
(<https://docs.expo.dev/versions/v57.0.0/>) before writing mobile code; SDK 57 differs from
older Expo. Parity rules are in "Web/mobile parity" above. Mobile owns only its UI: screens
(`apps/mobile/src/screens/`: Creator, Chat, CharWall, History, Game, Leaderboard) and
components are written natively, never shared with the DOM app.

- **`packages/shared` (`character-chatbot-shared`) is the canonical home for anything
  cross-platform**, an npm workspace resolved locally (edit it and re-run type-check, no
  install step). It holds API types (`types.ts`, mirroring the `@swagger` blocks), validation,
  storage keys, brand theme/copy, game and leaderboard state machines, character-creation flow,
  chat rules (`chat.ts`: intro prompt, history format/trim, adopt-longer-history, `/api/chat` request builder, reply validation, send retry with backoff),
  category taxonomy, and `formatRelativeTime`. Colors are authored once in
  `packages/shared/src/tokens/{light,dark}.json`; mobile flattens them and
  `scripts/generate-theme-css.cjs` feeds the same files to Style Dictionary for web's
  generated CSS.
- **Audio is `expo-audio`** (`useAudioPlayer` + `player.replace()`); `expo-av` is gone from SDK 57.
- **Stays on plain Expo Go, deliberately.** A custom dev client (`react-native-keyboard-controller` with
  prebuild) was tried for a keyboard bug and fully reverted once `insets.bottom` solved it.
  Don't adopt a native dependency without confirming Expo Go's module set truly can't do the job.
- **Chat is non-streaming** (React Native's `fetch` can't read an SSE body), so `/api/chat` and
  the game's `start`/`continue` run without `stream` and show a plain spinner. Game tokens are
  opaque in AsyncStorage; a guest's identity is a random SecureStore secret
  (`src/gameGuest.ts`) sent as `x-game-guest` in place of web's HttpOnly cookie. Correct and
  wrong guesses fire haptics (native-only extra).
- **Every request carries `x-api-key`** (`EXPO_PUBLIC_API_SECRET`), because React
  Native sends no `Origin`/`Referer` and so lands in `proxy.ts`'s external-origin branch. GETs
  carry it too (changed 2026-10-18) so a phone on Expo Go can reach a LAN dev server, whose host
  isn't first-party, without changing `proxy.ts`. The
  secret is extractable from the APK; the per-route rate limiter is the real abuse ceiling
  (same caveat as "Security posture"). A documented tradeoff, not an oversight: discuss before
  changing. Env vars: `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_SECRET` (`.env.example`).
- **Sign-in is a backend-mediated browser bridge**, since Auth.js's cookie session doesn't fit a
  mobile client and Expo Go has no native Google Sign-In. `src/auth.ts`'s `signIn()` opens
  `GET /api/auth/mobile-auth-start?redirect_uri=...` via `expo-web-browser`
  (`app.json`'s scheme `character-chatbot-mobile`), which lands on the backend's own
  `/auth/signin` page (Google or email). NextAuth's ordinary callbacks finish, then
  `mobile-auth-complete.ts` mints a bearer JWT (same shape as the web cookie; `getSessionUserId`
  reads either) back into the app. The token lives in memory and `expo-secure-store`
  (`src/authToken.ts`, split from `auth.ts` to avoid a cycle with `api.ts`) and is attached as
  `Authorization: Bearer`. `GET /api/auth/mobile-session` resolves it to `{ email, name }`.
  **Email-path limitation:** it only auto-completes if the magic link is tapped on the same
  device; elsewhere the in-app browser tab just waits. A signed-in user's characters persist via
  `POST /api/bots` (fire-and-forget), `HistoryScreen` lists them, and `ChatScreen` reconciles
  local history against `GET /api/messages` (adopt the server list only if longer), matching web.
- **Headers:** `AccountHeaderButton` is every screen's default `headerRight` (set in
  `App.tsx`'s `screenOptions` with `DarkModeButton`), so sign-in, name, and Past chats are
  reachable everywhere. It takes `navigation` as a prop, and lives in `headerRight` because
  overriding `headerLeft` would replace native-stack's back button.
- **Navigate with `navigation.navigate`, not `replace`,** from Creator/CharWall into Chat;
  replacing left Chat with no back button.
- **`CreatorScreen`'s carousel is a full-screen portrait backdrop**, mirroring web's landing page:
  `CharacterCarousel` renders first behind the screen (image layer ignores touches), with the
  current name as a top-right pill that starts that character's chat. The form sits in a
  62%-surface translucent panel under the pill, and the site name plus Beta badge live in the
  native header (`BrandTitle`, set via `App.tsx`), not the body. The earlier spinning-halo
  carousel and its fit-to-screen sizing were removed. Re-check layout on a short Android phone
  (the panel scrolls if it doesn't fit).
- **Keyboard avoidance in `ChatScreen`** uses `KeyboardAvoidingView` with `behavior="padding"` and
  `keyboardVerticalOffset={useHeaderHeight()}` (SDK 57's forced edge-to-edge disables
  `adjustResize`), and drops the input row's `insets.bottom` padding while the keyboard is open
  (it otherwise doubled up on a real Samsung). For a bug that reproduces on one device only, add a
  temporary on-screen debug readout of real device values before changing the mechanism blind.
- **Shared hand-drawn SVG icon glyphs were tried and reverted** (the send button rendered blank
  on a real Android device and stayed broken). Icons are `@expo/vector-icons` (Ionicons). If
  revisited, validate on a real Android device, not the web preview.
- **Branding** reuses the web favicon (`public/palette-icon.svg`): `assets/icon.png`,
  `splash-icon.png`, and the `android-icon-*` set are rendered from it (regenerate if it changes).
- **Web preview (`npx expo start --web`) is dev-only,** for layout and navigation; real network
  calls hit `proxy.ts`'s CORS wall by design.
- **No voice input on mobile** (declined 2026-09-27; see "Voice input" above).
- **Still to do for store release:** privacy policy listing (can point at the web site), Play
  Console listing, EAS signing config, internal testing track.

### Mobile testing, lint and CI

Jest (`jest-expo`) plus React Native Testing Library, tests under `apps/mobile/tests/` mirroring
`src/`, with the same 80% global coverage threshold. Its `npm run ci` (`lint --max-warnings=0`,
`lint:md`, `format:check`, `type-check`, `test:coverage`) runs from the root workflow
`.github/workflows/ci-mobile.yml` and inside the root `npm run ci`, which also runs
`packages/shared`'s tests.

- **RNTL v14's `render` and `fireEvent` are async;** always `await` both.
- **Wrap an async handler before `onPress`** (`() => void run()`), or a test that pauses a mocked
  request mid-flow hangs until Jest's timeout.
- **Screen tests render `navigation.setOptions`'s header in the same tree** via a harness with a
  memoized `navigation` object (see `ChatScreen.test.tsx`); an unmemoized one loops the effect.
- **Workspace hoisting** is handled in `jest.config.js` (`moduleNameMapper` forces one `react`;
  `moduleDirectories` finds native deps installed only under `apps/mobile`). `jest.setup.js` owns
  the native/global mocks (AsyncStorage, SecureStore, expo-audio, vector icons); a dependency bump
  can move a mock's path, so check there first.
- **ESLint** (`eslint-config-expo`) disables `react/no-unescaped-entities` and `react-hooks/refs`
  (false positives for RN; see `eslint.config.js`). `settings.react.version` is pinned, not
  `"detect"`, because ESLint 10 removed an API `eslint-plugin-react@7.37.5` calls during
  detection; **bump it by hand whenever mobile's `react` version changes.** Prettier and
  markdownlint configs deliberately mirror the root's.
- Audio playback, keyboard/scroll layout, and the real sign-in handoff can only be verified on a device.
