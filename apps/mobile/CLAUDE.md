@AGENTS.md

# CLAUDE.md

Android/iOS client for **character-chatbot-generator** (Next.js, deployed on Vercel).
Lives in this same monorepo as `apps/mobile` (folded in from a former standalone repo
in v0.6.1 — see "Key architectural decisions" below). This app is a pure API client:
no server code lives here. All chat/personality/avatar/validation logic stays in the
backend at the repo root; this app only renders it natively and calls it over HTTPS.

## Status (updated 2026-09-22)

MVP flow (phase 1) is wired end-to-end: `App.tsx` sets up a
`@react-navigation/native-stack` with `Creator` → `Chat`, plus `CharWall` (a phase-2
item pulled forward — see roadmap). `CreatorScreen` runs the personality → avatar →
voice pipeline (mirrors the web app's `useBotCreation`, minus the copyright/description
modals — those are still phase 2) and hands the built `Bot` to `ChatScreen` via route
params, using `navigation.navigate` (not `replace` — replacing Creator/CharWall out of
the stack left Chat with no back button and users stuck with no way out; found this the
hard way too). `ChatScreen` sends non-streaming `/api/chat` requests, persists history
through `src/storage.ts`, and plays `audioFileUrl` back with `expo-audio`.

**`expo-av` → `expo-audio`:** the SDK 57 docs no longer list `expo-av` at all (404) —
it's been fully replaced by `expo-audio`/`expo-video`. Swapped before writing any
playback code; TTS playback in `ChatScreen` uses `useAudioPlayer` + `player.replace()`.

**`character-chatbot-shared` is the canonical source for anything cross-platform** —
types and brand colors/copy live there (`src/theme.ts`, plus fixes to `src/types.ts`),
specifically so a future style/copy/contract change is one edit, not a resync across
three repos (icon glyphs were tried and reverted — see below). This
consolidation happened because three separate local workarounds had already piled up
in this repo for the same underlying problem — the shared package was out of sync with
what the backend and web app actually do:

- `ChatRequest.conversationHistory` was typed as `ChatMessage[]` but `src/pages/api/chat.ts`
  actually expects pre-formatted `"User: …"`/`"Bot: …"` strings (`buildClaudeMessages()`
  calls `.startsWith()` on each entry) — sending raw objects 500s with `"t.startsWith is
  not a function"`. Fixed in shared `types.ts` directly (also added the missing
  `isIntro` field — see chat.ts's `req.body.isIntro`); `ChatScreen.tsx`'s
  `formatHistory()` builds the string array, matching `useChatController.ts`'s own
  conversion.
- `POST /api/get-voice-config` wasn't in `types.ts` at all — added `GetVoiceConfigRequest`.
- Brand colors (`lightColors`/`darkColors`) and copy (`BRAND.name`/`kicker`/`headline`,
  mirroring `BotCreator.tsx`'s hero) live in shared `theme.ts` — this repo's
  `src/theme.ts` just re-exports them, `src/ThemeContext.tsx` provides the light/dark
  switch (mirrors the web app's `DarkModeContext` exactly: manual toggle only, no OS
  `prefers-color-scheme` following, same `STORAGE_KEYS.darkMode` key). The colors
  themselves are authored once, in `packages/shared/src/tokens/{light,dark}.json`
  (Style Dictionary token format) — shared `theme.ts` flattens them for this app, and
  the web app's `scripts/generate-theme-css.cjs` feeds the same two files to Style
  Dictionary to produce its own `src/app/theme-tokens.generated.css`. Both platforms read
  one source now; there's no more hand-copying a hex value between them.
- **Tried and reverted — shared hand-drawn icon glyphs.** Pulled the web app's
  hand-drawn send/stop/volume `<svg>` paths (from `ChatInput.tsx`) into shared
  `icons.ts` as platform-agnostic shape data, rendered here via `react-native-svg`
  for a pixel-identical glyph instead of a different icon library's lookalike. The
  send button then failed to render at all on a real Android device — not a color
  or contrast issue, the button was completely blank — and stayed broken through
  several fix attempts (elevation/overflow clipping, unmemoized per-keystroke
  `StyleSheet.create()` churn, splitting a compound multi-subpath `<Path>` into
  simple ones) with zero reproducibility in any preview. Reverted rather than keep
  chasing it: `icons.ts` is deleted from shared, and this screen's send/stop/volume
  icons are back on `@expo/vector-icons` (Ionicons) — confirmed working on-device
  elsewhere in this same app (the dark-mode toggle, the Creator screen's shuffle
  icon). If cross-platform icon sharing gets revisited, treat it as a genuinely
  hard problem, not a quick win — and validate on a real Android device before
  declaring it fixed, since none of this reproduced in the web preview.

**Branding assets reuse the web app's real brand mark**, not an invented one:
`assets/icon.png`, `splash-icon.png`, and the `android-icon-*` set are all rendered
from `character-chatbot-generator/public/palette-icon.svg` — the web app's actual
`<link rel="icon">` favicon (a terracotta paint palette) — via Playwright-rendered
HTML (see git history if you need to regenerate; the palette's SVG path is inlined in
that script, so if the web app's favicon ever changes, these need regenerating from
the new SVG to match). An earlier pass invented its own "P" monogram instead; replaced
once the real brand asset was found, since reusing it beats reinventing one. Wired up
via `app.json`'s `expo-splash-screen` plugin (with a `dark` variant) and
`adaptiveIcon.backgroundColor` (cream, matching the icon's own backdrop — the palette
shape itself is already terracotta).

**Keyboard avoidance on `ChatScreen` uses RN's built-in `KeyboardAvoidingView` with
`behavior="padding"` on both platforms, and `keyboardVerticalOffset={useHeaderHeight()}`
instead of a guessed constant.** Expo SDK 57 forces edge-to-edge on Android, which
stops the native window resize (`adjustResize`) keyboard-avoidance normally leans on
— confirmed empirically (`useWindowDimensions()` stayed constant across
`keyboardDidShow`). `"padding"` (not `"height"`, which showed a slight overlap here)
is the behavior that held up under edge-to-edge. `keyboardVerticalOffset` corrects
for the one thing `KeyboardAvoidingView` can't see on its own — the native-stack
header rendered above it, outside its own layout frame — and a hardcoded guess
(`90`, tuned by eyeballing one device) was measurably wrong elsewhere;
`useHeaderHeight()` reports the header's actual rendered height on whichever device
is running instead.

One more device-specific fix was needed on top of that: the input row's own
`paddingBottom: 10 + insets.bottom` (there for the gesture-nav bar height when the
keyboard's closed) was *also* still adding while the keyboard was open, on top of
`KeyboardAvoidingView`'s own lift — invisible on the Pixel-profile emulator
(`insets.bottom` is `0` there regardless), but a real, visible gap on a Samsung
(confirmed via a temporary debug overlay reading real device values: the gap's size
matched `insets.bottom` — `48` — almost exactly). Fixed by dropping `insets.bottom`
from that padding specifically while the keyboard is open (tracked via a `Keyboard`
listener already in the component, `debugKbHeight > 0`). **Confirmed working on both
the Android emulator and a real Samsung (API 36) after this fix.**

Three earlier Samsung-specific attempts were tried and reverted before landing here,
each breaking something already verified working on the emulator without fixing
Samsung: manually tracking `Keyboard` height unconditionally (as the sole mechanism,
no `KeyboardAvoidingView`), `react-native-safe-area-context`'s `insets.bottom` as the
*primary* keyboard-height signal (unreliable — worked on the emulator, did nothing on
Samsung), and `react-native-keyboard-controller`'s `automaticOffset` (genuinely
worked, but needs a custom dev client, given up rather than lose Expo Go
compatibility). What actually broke the stalemate was a temporary on-screen debug
readout (keyboard height, header height, window/screen size, `insets.bottom`,
`Platform.Version`) that the user screenshotted directly from the Samsung — the fix
came from that real data, not another round of guessing from emulator-only testing.
If a keyboard-avoidance bug resurfaces and only reproduces on one specific device,
reach for that pattern again before changing the mechanism blind.

**Web preview is dev-only:** `react-dom` and `react-native-web` were added so
`npx expo start --web` works as a fast local preview loop (no Android
Studio/emulator required). They're not part of the Android/iOS product target —
just a sanity-check surface for someone without a device/emulator handy. Browser
`fetch` sends an `Origin` header (RN's doesn't), so any real network call there hits
`proxy.ts`'s CORS wall — expected, not a bug; only layout/navigation are testable this way.

## Key architectural decisions already made (don't re-litigate without reason)

- **Lives in the same monorepo as the backend, as of v0.6.1** — originally a separate
  repo ("fork is the right call"), folded in via `git subtree` (full history preserved)
  once that separation stopped paying for itself. The old standalone
  `character-chatbot-mobile`/`character-chatbot-shared` repos (local and on GitHub)
  were deleted once the fold was confirmed safe — this monorepo is the only copy now.
  Still deploys independently of the web app (Expo/EAS, not Vercel) and doesn't touch
  the Next.js app's own build/CI beyond the path-filtered root workflow.
- **Shared code lives in `packages/shared`** (an npm workspace, `"character-chatbot-shared": "*"`
  in this app's `package.json` — resolved locally, no git dependency, no separate
  install step to pick up a shared-code change; just edit it and re-run type-check).
  It holds:
  - `src/types.ts` — API request/response contracts mirroring the web repo's
    `@swagger` JSDoc blocks (chat, validate-character, generate-personality,
    generate-avatar, chars, bots, messages, user-profile, random-character).
  - `src/validation.ts` — client-side copies of `sanitizeCharacterName`/
    `sanitizeDescription`/`sanitizeUserName` (UX only; the server is still the
    authoritative enforcement point).
  - `src/storageKeys.ts` — the same `STORAGE_KEYS` constants as the web app's
    `src/utils/storageKeys.ts`, for AsyncStorage instead of localStorage.
  - **The production web app has NOT been migrated to this shared package yet** —
    that's a deliberate, separate, later decision so the mobile MVP doesn't touch
    tested production code. Don't assume `security.ts`/`storageKeys.ts` in the web
    repo import from here; they're still independent copies for now.
- **UI/components are NOT shared** — no common rendering layer between Next.js/React
  DOM and React Native. Every screen here is written fresh.
- **Sign-in (Google and magic-link email) and account persistence are done.** Auth.js's
  cookie-based JWT session doesn't work for a mobile client, and plain Expo Go has no
  supported native Google Sign-In path (no custom dev client) — and a magic-link email
  flow needs a real browser tab regardless of platform — so this isn't an
  `expo-auth-session`/`@react-native-google-signin` id_token exchange, and it isn't a
  hand-rolled OAuth code exchange either. It's a generic backend-mediated
  browser-redirect bridge: `src/auth.ts`'s `signIn()` opens
  `GET /api/auth/mobile-auth-start?redirect_uri=...` in a browser tab
  (`expo-web-browser`'s `openAuthSessionAsync`, redirect URI from `expo-linking`'s
  `createURL`, matching `app.json`'s `"scheme": "character-chatbot-mobile"`), which
  redirects straight to the backend's own sign-in page (`src/app/auth/signin/`,
  `authOptions.ts`'s custom `pages.signIn` — styled to match the app instead of
  NextAuth's generic default picker, since web's own sign-in is an in-app lightbox
  that never navigates here), offering both Google and email. Whichever provider
  completes, NextAuth's own callback routes (`/api/auth/callback/google` /
  `/api/auth/callback/email`, both completely unchanged) handle it, then redirect to
  `src/pages/api/auth/mobile-auth-complete.ts`, which reads the resulting session cookie and
  mints a bearer JWT (`next-auth/jwt`'s `encode`, same shape as the web session cookie —
  `getSessionUserId` already reads either) back into the app. This replaced an earlier
  Google-only version (`mobile-google-start.ts`/`-callback.ts`) that hand-rolled the
  OAuth code exchange itself (`google-auth-library`) — duplicating logic NextAuth's own
  configured Google provider already does for web; the generic version has zero
  provider-specific code and needs no separate mobile redirect URI registered in Google
  Cloud Console (it piggybacks on the same `/api/auth/callback/google` URI web already
  uses). **Known limitation of the email path specifically:** it only auto-completes
  back into the app if the magic-link email is opened and tapped on the same device
  running the app — tapping it on a different device still signs that browser in, but
  there's no way to hand the resulting token back to the phone's waiting in-app browser
  tab, which will just sit until the user gives up and closes it. The token is cached
  in-memory and persisted via `expo-secure-store` (`src/authToken.ts`, split out from
  `src/auth.ts` to avoid a circular import with `src/api.ts`, which reads it
  synchronously to attach `Authorization: Bearer <token>`; keyed on shared
  `STORAGE_KEYS.authToken`, not a locally hardcoded string). `GET /api/auth/mobile-session`
  (since next-auth v4's JWT is encrypted — no client-side decode path) resolves the
  token to `{ email, name }` for display; `src/AuthContext.tsx`'s `useAuth()` exposes
  `status`/`email`/`name`/`signIn`/`signOut`, reachable via the account icon in
  `CreatorScreen`'s header (`AccountModal.tsx`). A created character persists to
  `POST /api/bots` when signed in (`persistBotIfSignedIn` in `botCreation.ts`,
  fire-and-forget); `HistoryScreen` ("Past chats", linked from `CreatorScreen` and
  `AccountModal` when signed in) lists them back via `GET /api/bots`
  (`persistedBotToBot` from the shared package), mirroring the web app's `/history`
  page; `ChatScreen`
  reconciles local chat history against `GET /api/messages?botName=` on open, adopting
  the server list only if it's longer (mirrors the web app's own reconciliation rule).
- **`CreatorScreen` must fit on one screen with no scrolling on any modern Android phone**
  (checked 2026-09-23 at 360x740 through 412x915, with a 3-button nav bar and a resume card
  showing, the tallest layout). The carousel is the one flexible element: `CreatorScreen`
  measures the viewport and everything else on screen, then passes `CharacterCarousel` a
  `size` (110 to 210) that fills whatever room is left. The viewport keeps the tallest
  height it has seen, so the Android keyboard doesn't also shrink the carousel. Don't give
  the scroll container `flexGrow: 1`, since the measurement needs its natural height.
  Adding anything tall to this screen means checking it still fits: Expo web plus
  Playwright at those sizes, with `/api/chars` stubbed (the web build can't reach the API
  because of CORS, and the carousel renders nothing without data).
- **`proxy.ts` on the backend requires `x-api-key` on every POST from this app** —
  React Native's `fetch` sends no `Origin`/`Referer` header, so every mutating request
  falls into proxy.ts's "external origin" branch. `src/api.ts` sends
  `EXPO_PUBLIC_API_SECRET` as `x-api-key` on every non-GET request. **Known, accepted
  limitation:** this secret is bundled into the JS and extractable from the APK; the
  per-route rate limiter on the backend is the real abuse ceiling, same caveat
  `proxy.ts` already documents for non-browser callers in general. Don't try to "fix"
  this without discussing it first — it's a documented tradeoff, not an oversight.
- **Streaming is out of scope for v1.** `/api/chat`'s `stream: true` SSE mode isn't
  used — RN's `fetch` doesn't support `ReadableStream` well. Call `/api/chat`
  non-streaming and show a typing indicator while waiting.
- **Env vars:** `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_SECRET` (see
  `.env.example`) — both must match the target backend deployment. `EXPO_PUBLIC_*` is
  Expo/Metro's built-in convention for inlining env vars into the bundle.
- **Stays on plain Expo Go, deliberately** — a custom dev client
  (`react-native-keyboard-controller` + `expo prebuild`) was tried while chasing the
  Android keyboard-avoidance bug above and fully reverted once `insets.bottom` turned
  out to solve it without any native module. Don't reach for a dev client/native
  dependency again without confirming Expo Go's built-in module set genuinely can't
  do the job — it solved a problem here that looked like it needed one.

## Phased roadmap

1. **MVP (current phase):** Creator screen (name input, calls `generate-personality`
   → `generate-avatar`, no copyright/description modals yet — those are phase 2) → Chat
   screen (`/api/chat` non-streaming, `expo-audio` TTS playback, AsyncStorage history).
   Guest only. Also done, pulled forward from phase 2: **Character Wall**
   (`CharWallScreen.tsx`, paginated `/api/chars`, tap a portrait → same
   personality/avatar/voice pipeline as Creator → Chat), and light/dark theming
   (`ThemeContext.tsx`).
2. **Parity pass:** Done — `validate-character` + copyright/caution/blocked handling
   (`CopyrightWarningModal.tsx`), the original-character description flow
   (`CharacterDescriptionModal.tsx`), resume-saved-bot (Creator screen's "Continue
   chatting with X" card, backed by local storage for guests and `GET /api/bots` for
   signed-in users), the landing carousel (`CharacterCarousel.tsx`, in the Creator
   screen body rather than a header slot), Google sign-in + account persistence
   (see "Key architectural decisions" above), and the personalized greeting (the
   visitor's own preferred name — `src/useUserName.ts` mirrors the web app's
   `useUserName.ts` exactly: AsyncStorage for guests, `GET`/`POST /api/user-profile`
   for signed-in users, seeded once from a guest value on first sign-in.
   `NameCaptureModal.tsx` gates `CreatorScreen`'s two creation entry points — typed
   name and carousel tap — the first time no name is known yet, and doubles as
   `AccountModal.tsx`'s "Add your name"/"Called: X" edit row; `ChatScreen.tsx` already
   sent/displayed it once storage.ts's `saveUserName` finally had a caller). All of
   this is reachable via the account icon in `CreatorScreen`'s header only, for now;
   every other screen still has no sign-in/account/name entry point (mobile has no
   shared header/menu component the way the web app does).
3. **Guessing game + leaderboard: done (2026-09-23).** `GameScreen.tsx` and
   `LeaderboardScreen.tsx` run on the same shared state machines as web
   (`packages/shared`'s `useGameSession`/`game.ts`, `useLeaderboard`/`useLeaderboardClaim`);
   `src/useGameController.ts` only supplies the platform side. It calls `/api/game/start`
   and `/api/game/continue` without `stream` (React Native's fetch can't read an SSE body),
   so there is a plain spinner, not the staged progress checklist. The token is kept opaque
   in AsyncStorage. A guest's identity is a random secret in SecureStore (`src/gameGuest.ts`),
   sent as the `x-game-guest` header in place of web's HttpOnly cookie. Correct and wrong
   guesses trigger haptics, a native-only extra. `ChatScreen` and `GameScreen` share
   `components/ChatView.tsx`, mirroring web's `ChatShell.tsx`. Character creation
   (`CreatorScreen`, and the Character Wall's tap-to-chat) likewise runs on shared
   `useCharacterCreation`/`generateCharacter` over `src/botCreation.ts`'s `mobileTransport`.
4. **Store-ready:** icon/splash now reuse the web app's real brand mark (see Status
   above) — still need a privacy policy (can point at the existing Next.js site), Play
   Console listing, EAS Build signing config, internal testing track.

## Backend reference

The backend this app calls is `../character-chatbot-generator` — read its own
CLAUDE.md for how `/api/chat`, `/api/generate-personality`, `/api/generate-avatar`,
`/api/validate-character`, `/api/chars`, `/api/bots`, `/api/messages`,
`/api/user-profile`, and `/api/random-character` actually behave server-side. This
repo should never reimplement that logic — only call it.

## Testing

Jest (`jest-expo` preset) + React Native Testing Library, tests under `tests/`
mirroring `src/`. `npm run test:coverage` enforces the same 80% global threshold as the
web app (`jest.config.js`), covering every critical path: creation (validation, copyright
and description modals, name gate, cancel), resume, chat, the Character Wall, the guessing
game and leaderboard, and sign-in.
Things worth knowing before writing a new test:

- **RNTL v14's `render` and `fireEvent` are async** — always `await` both, or queries run
  against a Promise and state updates land after the assertion.
- **Wrap an async handler before passing it as `onPress`** (`() => void run()`, not
  `onPress={run}`): RNTL's async `fireEvent` awaits the handler's returned promise, so a
  test that pauses a mocked request mid-flow hangs until Jest's timeout instead of
  rendering the in-progress state.
- **Screen tests render `navigation.setOptions`'s header in the same tree** via a small
  harness with a memoized `navigation` object (see `ChatScreen.test.tsx`) — a second
  `render` replaces the first, and an unmemoized object loops the screen's effect forever.
- **Workspace hoisting cuts both ways**, handled in `jest.config.js`: `moduleNameMapper`
  forces one `react` copy, and `moduleDirectories` lets root-hoisted `@react-navigation/*`
  find native deps installed only here (`react-native-screens`, `react-native-safe-area-context`).
- **`jest.setup.js` owns the native/global mocks** (AsyncStorage, SecureStore, expo-audio,
  vector icons — the last replaced wholesale because its async font check corrupted later
  tests). A dependency bump can move a mock's path (async-storage 3.x did); check there first.

Manual device testing is still the only way to verify audio playback, keyboard/scroll
layout, and the real sign-in browser handoff.

## Linting, formatting & CI

`npm run ci` is the single composite command (`lint --max-warnings=0` → `lint:md` →
`format:check` → `type-check` → `test:coverage`) — same one the root repo's
`.github/workflows/ci-mobile.yml` runs on every push/PR to `main` (moved there from this
repo's own `.github/workflows/` during the monorepo migration - GitHub only reads workflows
at the repo root, so a copy living under `apps/mobile/.github` would be silently dead). The
root `npm run ci` also runs it, plus `packages/shared`'s tests, so one local command gates
web, mobile, and shared code together.

- **ESLint**: `eslint.config.js`, scaffolded via `npx expo lint` (`eslint-config-expo`).
  Two of its bundled rules are disabled repo-wide, both false positives for this
  codebase rather than real issues — see the comments in `eslint.config.js` itself:
  `react/no-unescaped-entities` (a web/HTML-entity rule that doesn't apply to RN
  `Text` children) and `react-hooks/refs` (flags the standard, RN-documented
  `useRef(new Animated.Value(...)).current` pattern as an illegal render-time ref
  read — it isn't, for `Animated.Value`).
- **`settings.react.version` is pinned explicitly (not `"detect"`)** — required, not just
  an optimization. ESLint 10 removed the deprecated `context.getFilename()` API that
  `eslint-plugin-react@7.37.5` (already latest as of this writing, no newer release fixes
  it) still calls internally during auto-detection, crashing every lint run with
  `contextOrFilename.getFilename is not a function`. An explicit version skips that code
  path entirely. **Must be bumped by hand whenever `package.json`'s own `"react"` version
  changes** — nothing will warn on drift, it'll just silently apply eslint-plugin-react's
  version-gated rules against a stale React version.
- **Prettier**: `.prettierrc.json` deliberately mirrors `character-chatbot-generator`'s
  settings (100-char width, double quotes, trailing commas) for a consistent style
  across the two repos, not because RN/Expo requires it.
- **markdownlint**: `.markdownlint.json`, also mirroring the web repo's config
  (line-length, inline-HTML, first-line-heading, and duplicate-H1 rules off — this
  repo's own CLAUDE.md/AGENTS.md prose would otherwise trip several of these).
