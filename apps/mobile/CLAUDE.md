@AGENTS.md

# CLAUDE.md

Android/iOS client for **character-chatbot-generator** (Next.js, deployed on Vercel —
sibling repo at `../character-chatbot-generator`). This app is a pure API client: no
server code lives here. All chat/personality/avatar/validation logic stays in the
existing backend; this repo only renders it natively and calls it over HTTPS.

## Status (updated 2026-09-13)

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

- `ChatRequest.conversationHistory` was typed as `ChatMessage[]` but `pages/api/chat.ts`
  actually expects pre-formatted `"User: …"`/`"Bot: …"` strings (`buildClaudeMessages()`
  calls `.startsWith()` on each entry) — sending raw objects 500s with `"t.startsWith is
  not a function"`. Fixed in shared `types.ts` directly (also added the missing
  `isIntro` field — see chat.ts's `req.body.isIntro`); `ChatScreen.tsx`'s
  `formatHistory()` builds the string array, matching `useChatController.ts`'s own
  conversion.
- `POST /api/get-voice-config` wasn't in `types.ts` at all — added `GetVoiceConfigRequest`.
- Brand colors (`lightColors`/`darkColors`, mirroring `app/globals.css`/`darkmode.css`)
  and copy (`BRAND.name`/`kicker`/`headline`, mirroring `BotCreator.tsx`'s hero) live in
  shared `theme.ts` — this repo's `src/theme.ts` just re-exports them, `src/ThemeContext.tsx`
  provides the light/dark switch (mirrors the web app's `DarkModeContext` exactly:
  manual toggle only, no OS `prefers-color-scheme` following, same
  `STORAGE_KEYS.darkMode` key).
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
- **Not done, flagged for later:** the web app still hand-maintains its own CSS copies
  of these colors in `globals.css`/`darkmode.css` rather than generating them from
  shared `theme.ts` — actually wiring that up is a real migration into
  production-app build tooling, out of scope for a mobile-side pass. Whoever touches
  web app colors next should update shared `theme.ts` too (or better, do the migration).

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

- **Separate repo from the web app, on purpose** ("fork is the right call") — not a
  monorepo merge. Deploys independently, doesn't touch the production Next.js app's
  build/CI.
- **Shared code lives in a third repo**, `../character-chatbot-shared` (sibling
  folder, private on GitHub at `andylacroce/character-chatbot-shared` — consumed via
  `"character-chatbot-shared": "git+https://github.com/andylacroce/character-chatbot-shared.git"`
  in `package.json`, tracking its default branch rather than a pinned commit, since
  both repos are still evolving together; re-run `npm install` after pushing a shared
  change to pick it up here). It holds:
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
- **Auth is deferred to phase 2.** Phase 1 is guest-only, matching the web app's
  guest experience (AsyncStorage-only persistence, no sign-in). When phase 2 starts:
  Auth.js's cookie-based JWT session doesn't work for a mobile client, so the plan is
  a new backend endpoint (`POST /api/auth/mobile-google`, not built yet) that verifies
  a Google `id_token` from `expo-auth-session`/`@react-native-google-signin` and
  returns a bearer JWT (reusing `next-auth/jwt`'s `encode`) for
  `Authorization: Bearer <token>` — plus a small branch in `getSessionUserId` to accept
  either a cookie session or that bearer token. Don't build this until asked.
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
   chatting with X" card, using the one bot saved locally — not an auth-gated
   multi-bot list, since phase 1 has no accounts), and the landing carousel
   (`CharacterCarousel.tsx`, in the Creator screen body rather than a header slot).
   Still open: Google sign-in — needs a new backend endpoint, a bigger cross-repo lift.
3. **Store-ready:** icon/splash now reuse the web app's real brand mark (see Status
   above) — still need a privacy policy (can point at the existing Next.js site), Play
   Console listing, EAS Build signing config, internal testing track.

## Backend reference

The backend this app calls is `../character-chatbot-generator` — read its own
CLAUDE.md for how `/api/chat`, `/api/generate-personality`, `/api/generate-avatar`,
`/api/validate-character`, `/api/chars`, `/api/bots`, `/api/messages`,
`/api/user-profile`, and `/api/random-character` actually behave server-side. This
repo should never reimplement that logic — only call it.

## Testing

Proportional to a hobby project: React Native Testing Library for a few critical
components (chat send/receive, name gate) once they exist. Don't chase the web repo's
80% coverage gate — that's calibrated for the production app, not this new client.
Manual device testing is the practical way to verify audio playback and any future
native sign-in module.

## Linting, formatting & CI

`npm run ci` is the single composite command (`lint --max-warnings=0` → `lint:md` →
`format:check` → `type-check`) — same one `.github/workflows/ci.yml` runs on push/PR
to `main`. No test/build step yet, deliberately — matches Testing above; add them to
both places together once real tests exist.

- **ESLint**: `eslint.config.js`, scaffolded via `npx expo lint` (`eslint-config-expo`).
  Two of its bundled rules are disabled repo-wide, both false positives for this
  codebase rather than real issues — see the comments in `eslint.config.js` itself:
  `react/no-unescaped-entities` (a web/HTML-entity rule that doesn't apply to RN
  `Text` children) and `react-hooks/refs` (flags the standard, RN-documented
  `useRef(new Animated.Value(...)).current` pattern as an illegal render-time ref
  read — it isn't, for `Animated.Value`).
- **Prettier**: `.prettierrc.json` deliberately mirrors `character-chatbot-generator`'s
  settings (100-char width, double quotes, trailing commas) for a consistent style
  across the two repos, not because RN/Expo requires it.
- **markdownlint**: `.markdownlint.json`, also mirroring the web repo's config
  (line-length, inline-HTML, first-line-heading, and duplicate-H1 rules off — this
  repo's own CLAUDE.md/AGENTS.md prose would otherwise trip several of these).
