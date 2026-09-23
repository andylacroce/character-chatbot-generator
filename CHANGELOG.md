# Changelog

This changelog reads as curated highlights of what shipped and why, not an exhaustive commit-by-commit log — routine dependency bumps, formatting/lint fixes, and small iterative churn are omitted or collapsed. Dates are calendar dates commits landed. Starting 2026-09-22, a git tag (`vX.Y.Z`, matching `package.json`) marks each shipped entry below — see CLAUDE.md's "Versioning" section for the convention. Entries before that date predate tagging and have none; sections are grouped by date range regardless.

## v0.12.1 — 2026-09-23 — Strict guessing-game identity checks

- Fixed the guessing game accepting a mythological counterpart as the hidden character: Aphrodite is now scored as distinct from Venus (as are comparable cross-tradition figures such as Ares/Mars and Zeus/Jupiter), not as an alias. Correctness is settled once by the classifier before response generation; the reaction receives only that confirmed outcome, so the banner and character reply cannot independently disagree.
- Fixed guessing-game audio replay after a correct-answer handoff: every message now retains its own speaker's voice hint, so regenerating an older message does not use the new current character's voice.
- Character voice casting now uses the generated personality and speaking style and chooses only from Google Cloud TTS's live v1 Studio, Neural2, WaveNet, Standard, News, Journey, and Polyglot inventory. Casting no longer synthesizes a throwaway validation sample, and all chat response paths now apply the selected prosody consistently.
- Fixed every character silently getting the same default fallback voice: Google's live `ListVoices` response reports each voice's gender as the enum's string name (e.g. `"FEMALE"`), not a number, so a numeric-only check was misreading the entire catalog as unspecified gender, filtering out every voice, and falling back to `CHARACTER_VOICE_MAP["Default"]` for every character.
- Fixed a Studio-voice swap that could hand a character a different Studio voice than the one actually cast (e.g. a female British character's selection silently swapped for a male American voice) — the swap is gone, and any real Studio voice from Google's inventory now synthesizes exactly as cast.

## v0.12.0 — 2026-09-23 — Guessing game and leaderboard on mobile; one shared codebase for both apps

- Web and mobile now resolve one React version across the monorepo: React 19.3.0, the current stable release. Root npm overrides prevent transitive dependencies from installing a second React or React DOM copy in future installs.
- The mobile app now has the guessing game (the streak, the correct/wrong banners, give-up, and the personal best) and the public leaderboard, including claiming a top-ten spot. Correct and wrong guesses buzz the phone. A guest's streaks count toward the leaderboard through a random per-device secret kept in secure storage, which plays the role of the web app's guest cookie.
- Web and mobile now run the same code for the guessing game, the leaderboard, character creation (validation, the copyright and description prompts, the name gate, cancelling), the landing carousel, and the visitor's own name. It lives once in `packages/shared`, and each app adds only its own requests, storage, and logging. A fix to any of these now lands on both apps at once, and the per-app copies of that logic are gone.
- Behavior changes that come from sharing: tapping a mobile carousel portrait now runs the same name validation a typed name does, and a failed random pick on mobile quietly falls back to a default name the way web already did.
- Fixed: a web validation reply with an empty body could skip the "proceed anyway" fallback and log a false validation failure.
- Mobile can now replay any past character message, like web already could. On both apps the replay button is now a speaker icon instead of a circular arrow, so it reads as "hear this again".
- Character names no longer show their disambiguation note, e.g. "David Copperfield" instead of "David Copperfield (Charles Dickens novel)", in chat headers, message labels, the Character Wall, the carousels, Past chats, the game's reveal lines, and downloaded transcripts. The full name is still what the app sends to Claude and uses as the cache key, so the right character is still picked.
- Fixed on mobile: the "Continue chatting with" card showed the previous character after you came back from a new chat, and a long character name in a chat header ran under the header's buttons.

## v0.11.0 — 2026-09-23 — Past chats page; mobile landing fits one screen

- A signed-in user's saved characters now live on their own "Past chats" page instead of in a list on the landing page, where they had grown to take up too much room. On web it's `/history`, linked from the landing page's footer and the account menu. On mobile it's a new `HistoryScreen`, linked from the Creator screen and the account modal. Both show how long ago each chat was last active; mobile gets that from a `formatRelativeTime` now in the shared package, which web mirrors until it migrates onto that package. Web rows resume through the same `/?name=` launch the Character Wall already uses. Cancelling that launch now goes back to whichever page started it, not always to the Character Wall.
- The mobile landing screen now fits on one screen with no scrolling on modern Android phones (checked at 360x740 through 412x915, even with a 3-button nav bar). The character carousel shrinks to fill whatever room is left. The Character Wall and Past chats links now share one row, and the header's "New Character" title is gone.

## v0.10.1 — 2026-09-23 — Mobile test suite; screen-reader labels

- The mobile app now has a real test suite (Jest + React Native Testing Library, 181 tests across 20 suites) covering every critical path (character creation with its validation, copyright, description and name-gate flows; resuming; chat; the Character Wall; sign-in), gated at the same 80% coverage threshold as the web app. It runs as part of both the mobile `npm run ci` and the root one, and in GitHub Actions.
- Mobile's icon-only buttons (mute/unmute, stop audio, send, random character) now carry accessibility labels, so screen readers announce them instead of an unlabeled button.
- Both CI workflows now run on every push/PR to `main` instead of being path-filtered, since the root `npm run ci` gates web, mobile, and shared code together.

## v0.10.0 — 2026-09-22 — Default to dark mode; mobile guessing-game plan documented

- The app (web and mobile) now defaults to dark mode for a visitor/device with no stored preference yet — an explicit toggle choice still wins on every return visit, only the no-preference-yet default changed. Centralized as a single named constant per platform instead of a hardcoded `true`/`"dark"` scattered across files: `packages/shared/src/theme.ts`'s new `DEFAULT_DARK_MODE` (mobile's `ThemeContext.tsx` imports it directly) and a mirrored local constant in `app/components/DarkModeContext.tsx` (web hasn't migrated onto the shared package yet, per existing precedent). `app/layout.tsx` derives its server-rendered `<html>` class from that same constant rather than a separately hardcoded string, so a first-time web visitor's initial paint already matches with no flash of the other palette.
- `apps/mobile/CLAUDE.md`'s roadmap now has a full, concrete implementation plan for the guessing game mobile port (the largest remaining parity gap) — exact endpoint shapes to reuse, the finding that SSE streaming won't work reliably in React Native (call `/api/game/start`/`/continue` without `stream:true`), which parts of `useGameController.ts` port near-verbatim, copy gaps in `gameCopy.ts`, and a suggested first-pass scope (core loop + personal high score, defer the public leaderboard UI). Paused before implementation starts, for a fresh session to pick up.

## v0.9.2 — 2026-09-22 — Fix "Back to Home" trapping mobile users in the sign-in tab

- `AuthSignInPage.tsx`'s "Back to Home" link only ever navigates within the current page — harmless on web, but on mobile this page runs inside `expo-web-browser`'s in-app browser tab, where a page-level link can't close that tab and hand control back to the native app (only the browser's own native close/"Done" button, or a matching redirect, can do that). Tapping it just showed the web app's landing page trapped inside the same tab. Detected via the mobile bridge's `callbackUrl` (always points at `mobile-auth-complete`) and swapped for a plain hint ("Close this tab to return to the app") in that context; unchanged for an ordinary web visitor.

## v0.9.1 — 2026-09-22 — Custom-styled sign-in page for the mobile bridge

- `authOptions.ts` now configures a custom `pages.signIn: "/auth/signin"` (`app/auth/signin/page.tsx` → `AuthSignInPage.tsx`), styled to match the rest of the app — same colors/fonts/button and form treatment as `SignInModal.tsx` — instead of NextAuth's generic, unstyled default picker page. Web's own sign-in (`SignInModal.tsx`, an in-app lightbox) never navigates here; this exists because the mobile sign-in bridge (`pages/api/auth/mobile-auth-start.ts`, shipped in v0.9.0) opens a bare browser tab with no in-app lightbox context to render into, and was landing on NextAuth's stock page until now.
- Conditionally hides either the Google button or the email form via `getProviders()` if that provider isn't actually configured on the current environment (mirrors `SignInModal.tsx`'s own `hasEmailProvider` guard), and surfaces `?error=` codes from a failed attempt with a plain-language message (no separate `pages.error` is configured, so failures redirect back to this same page).

## v0.9.0 — 2026-09-22 — Mobile email sign-in, unified auth bridge

- Mobile now supports magic-link email sign-in alongside Google. Rather than adding a second provider-specific bridge, the entire mobile sign-in mechanism was unified: `pages/api/auth/mobile-auth-start.ts` now redirects straight to the backend's own real NextAuth sign-in page — the exact same page/form a web visitor already uses, offering both providers — instead of talking to Google directly. Whichever provider the visitor completes, NextAuth's own unmodified callback routes (`/api/auth/callback/google`, `/api/auth/callback/email`) handle it, then redirect to the new `pages/api/auth/mobile-auth-complete.ts`, which reads the resulting session and mints the mobile bearer token.
- This retires the Google-only `mobile-google-start.ts`/`-callback.ts` pair, which hand-rolled the OAuth code exchange itself (`google-auth-library`'s `OAuth2Client`) — duplicating logic NextAuth's own configured provider already does for web. The generic version needs no separate mobile-specific redirect URI registered in Google Cloud Console either (it piggybacks on the same `/api/auth/callback/google` URI web already uses) and automatically inherits `authOptions.ts`'s environment-based provider swapping (e.g. Preview's stub credentials provider) for free.
- **Known limitation:** the email path only auto-completes back into the app if the magic link is opened on the same device running the app — tapping it on a different device still signs that browser in, but there's no mechanism to hand the resulting token back to the original device's waiting in-app browser tab.
- `apps/mobile/src/authToken.ts`'s SecureStore key now uses the shared `STORAGE_KEYS.authToken` constant instead of a locally hardcoded string (an inconsistency found while reviewing this change) — anyone already signed in on-device before this update will need to sign in again once.

## v0.8.0 — 2026-09-22 — Mobile personalized greeting

- Mobile now supports the visitor's own preferred name — what a character should call them, distinct from any character's own name. `apps/mobile/src/useUserName.ts` mirrors the web app's `useUserName.ts` exactly: AsyncStorage for guests, `GET`/`POST /api/user-profile` for signed-in users (seeded once from a guest-entered value on first sign-in). The read/send/display plumbing already existed in `ChatScreen.tsx` (it already sent `userName` on every chat request and showed it in the transcript) — this ships the missing piece: an actual way to type it in.
- `NameCaptureModal.tsx` (new) gates `CreatorScreen`'s two creation entry points — typed name and carousel tap — the first time a device doesn't know the visitor's name yet, and doubles as an anytime "Add your name"/"Called: X" edit row in `AccountModal.tsx`, sharing one `useUserName()` instance so an edit there stays in sync with the gate.

## v0.7.2 — 2026-09-22 — Local static-analysis security scanning

- Added `eslint-plugin-security` to the app/src/API layers' ESLint config, gated on the same `--max-warnings=0` this repo's `npm run ci`/CI already enforce for every other lint rule, so a real finding fails the build the same way a missing JSDoc comment or a stray `console.log` already does. Runs on every commit/PR, ahead of GitHub's own CodeQL scan (which only fires after a push).
- Disabled two of its bundled rules after reviewing what they flagged: `detect-object-injection` (fires on essentially any dynamic property access, not just attacker-controlled ones — the plugin's own docs note this) and `detect-non-literal-fs-filename` (flagged 47 pre-existing call sites in the TTS/audio-cache subsystem, every one already building its path from a hashed cache key run through `sanitizeFilename()`, or `audio.ts`'s own `escapesRoot()`/`realpathSync()` traversal guard, inside a fixed root — the rule can't see past that sanitization). One genuine false positive from a different rule (`detect-possible-timing-attacks`, tripped by a client-side dedupe variable merely named `hash` in `useGameController.ts`) got a narrow inline suppression instead, so the rule stays live for an actual future secret-comparison bug.

## v0.7.1 — 2026-09-22 — Fix mobile dev bundling broken by a dependabot bump

- `apps/mobile` failed to bundle at all in dev (`Cannot find module 'react-native/rn-get-polyfills'`) — a recent dependabot bump had pushed `react-native` to 0.87.1, which removed a file `@expo/metro-config` (Expo SDK 57's bundler integration) still requires directly. Not just an outdated-version nag: SDK 57 is built against RN ~0.86.x, and 0.87.x has a real, breaking incompatibility at that integration point. Fixed via `npx expo install --fix`, realigning `react-native` and its SDK-57-compatible companions (`react`/`react-dom`, `@types/react`, `react-native-safe-area-context`, `react-native-screens`, `@react-native-async-storage/async-storage`, `typescript`) back to the versions Expo actually supports.
- Discovered while wiring up and testing v0.7.0's mobile sign-in — confirmed working end-to-end against production after this fix.

## v0.7.0 — 2026-09-22 — Mobile Google sign-in and account persistence

- Wired up the mobile app's Google sign-in bridge (`pages/api/auth/mobile-google-start.ts`/`-callback.ts`), added in v0.6.1 but never reachable from the mobile side until now. `apps/mobile/src/auth.ts` opens the bridge in a browser tab (`expo-web-browser`'s `openAuthSessionAsync`) and persists the resulting bearer token via `expo-secure-store`; a new `GET /api/auth/mobile-session` endpoint resolves that token to a display identity, since next-auth v4's JWT session token is encrypted and has no client-side decode path.
- Signed-in mobile users now get real account persistence: a created character saves to `POST /api/bots` (`persistBotIfSignedIn`), `CreatorScreen` lists them back as a "Previously" section via `GET /api/bots`, and `ChatScreen` reconciles local chat history against `GET /api/messages` on open — the same server-authoritative behavior web already has for signed-in users. Reachable via a new account icon in `CreatorScreen`'s header (`AccountModal.tsx`); no other mobile screen has a sign-in entry point yet.
- Fixed a latent bug in the mobile sign-in bridge: it hard-required `NEXTAUTH_URL`, which isn't actually set on this app's production deployment (web's own sign-in already relies on NextAuth's host-header inference instead). `src/utils/requestBaseUrl.ts` replicates that same inference (`x-forwarded-host`/`x-forwarded-proto`, matching `next-auth`'s own `detectOrigin()`) so the bridge needs no new env var.
- Folded the former standalone `character-chatbot-mobile` and `character-chatbot-shared` repos' remaining traces away: both were deleted (local clones and GitHub remotes) now that everything lives in this monorepo with history preserved from the v0.6.1 subtree fold.

## v0.6.2 — 2026-09-22 — All-rights-reserved license, npm cleanup, parallel CI

- Replaced the MIT `LICENSE` with an all-rights-reserved notice: the source stays publicly viewable for portfolio purposes, but no permission is granted to use, copy, modify, or redistribute it. `package.json`'s `license` field changed to `UNLICENSED` (root, `apps/mobile`, `packages/shared`), and the README's badge/License section updated to match.
- Removed `apps/mobile/LICENSE`, which was an unedited leftover from the `create-expo-app` template (copyright 650 Industries/Expo, not this project) — one root `LICENSE` now governs the whole monorepo.
- npm cleanup: `apps/mobile` now explicitly declares `@react-navigation/elements` (it was only ever resolving by accident via hoisting from `@react-navigation/native-stack`); `npm dedupe` trimmed 7 redundant nested packages. Investigated all 15 moderate `npm audit` findings (all dev/build-tooling only — `drizzle-kit`'s CLI and Expo's iOS project-file tooling, nothing shipped to users); a real fix would require dropping this repo's required `legacy-peer-deps=true` (itself load-bearing for an intentional `nodemailer` major bump past `next-auth`'s stale peer range, and for web's React 19.3.0 coexisting with `apps/mobile`'s Expo-pinned React 19.2.3), so left as accepted, documented findings rather than forcing a fix that breaks install.
- `ci.yml` (web) split from one sequential job into three parallel jobs (lint/type-check, test, build) — free on this public repo, cuts CI wall-clock time to roughly the slowest job instead of the sum of all steps. Added a Jest cache alongside the existing Next.js build cache.

## v0.6.1 — 2026-09-22 — Monorepo migration: fold in the mobile app and shared package

- Folded the separate `character-chatbot-mobile` and `character-chatbot-shared` repos into this one as `apps/mobile` and `packages/shared` (via `git subtree`, full history preserved), wired up as a real npm workspace. Web stays at the repo root to avoid touching Vercel's working deploy config.
- `packages/shared` drops its `tsc`/`dist` build step in favor of raw TS source, consumed directly by both Next's `transpilePackages` and Metro's SDK 57 zero-config workspace detection — no manual build/install step needed to pick up a shared-code change from either app anymore.
- Added a backend-mediated Google Sign-In bridge (`/api/auth/mobile-google-start`/`-callback`) for the mobile app, since plain Expo Go has no supported native Google Sign-In path; `getSessionUserId` now reads `next-auth/jwt`'s `getToken()` directly, supporting both the web session cookie and a mobile bearer token with no extra branching. Not yet wired up on the mobile side.
- CI restructured for the new layout: mobile's workflow moved to the repo root (it was silently dead in its old nested location — GitHub only reads workflows there) and made path-filtered so it only runs on `apps/mobile`/`packages/shared` changes; web's CI skips mobile-only pushes. Both gained npm dependency caching, and web's gained a Next.js build cache — a full `npm ci` was newly pulling in ~950 unused React Native/Expo packages on every web CI run with no caching at all.

## v0.6.0 — 2026-09-22 — Shared character-loading lightbox, header layout changes

- Added `CharacterLoadingOverlay`, one shared staged-progress lightbox for every "a character is being generated/loaded" moment: the guessing game's start-a-run and next-round generation (previously a plain inline spinner) and the landing page's character-creation flow (URL auto-launch, resume/new-chat interstitial, validation, and personality/avatar/voice generation — previously four near-duplicate inline progress blocks). Shows a live checklist with a checkmark on each genuinely-completed step, a spinner on the active one, driven by real server-reported progress.
- Added a "Back" button to the leaderboard page's header, matching the Character Wall's existing back-navigation pattern.
- Moved the dark-mode toggle out of the hamburger dropdown into its own small icon button in the header, next to the hamburger, on every page — reversing an earlier design that had folded it into the dropdown to save mobile header space, after feedback that the toggle should be reachable in one tap. Required widening the header's side columns so `AppHeader`'s center content (the landing page's carousel, chat/game's avatar+name) stayed visually centered against the now-wider right side.
- The Character Wall's and leaderboard's "Back" link now renders in the header's left slot (a new optional `left` prop on `AppHeader`) instead of the center slot, so it reads as left-aligned page navigation rather than the header's focal content.

## v0.5.1 — 2026-09-22 — README overhaul, MIT license, privacy/disclaimer accuracy fixes

- Added an MIT `LICENSE` file and updated `package.json`/`README.md` to reference it explicitly, replacing the previously-implicit "educational/portfolio project" framing with an actual license decision.
- Restructured `README.md`: moved Project Structure to the end as reference material, added badges/a table of contents/a live demo link, fixed a stale description of `npm run ci`'s steps, consolidated redundant testing sections, and documented two previously-undocumented env vars (`GAME_TOKEN_SECRET`, `EMAIL_SERVER`/`EMAIL_FROM`).
- Fixed a real inaccuracy in the privacy policy: it claimed guest data is "never saved to our servers," which was false for the guessing game's server-side guest best-streak tracking. Added "Guessing game" and "Cookies" sections, replaced a stale Gemini/Vertex avatar-generation mention with the actual current providers (Cloudflare Workers AI, Pollinations.ai), and added the visitor's own preferred name to the list of data stored for a signed-in user.
- The data-deletion page's promise now explicitly covers guessing-game history and leaderboard name, and clarifies that aggregate anonymous usage counts aren't affected by a deletion request.

## 2026-09-22 — Landing page CTA order

- Swapped the landing page's two CTAs so "Play the Guessing Game" appears before "Pick from the Character Wall".

## 2026-09-22 — Chat replies no longer use em dashes

- Added an explicit formatting instruction to the system prompts for ordinary chat replies (`pages/api/chat.ts`) and every guessing-game in-character turn (`src/utils/gameReply.ts`) telling Claude never to use an em dash, since Claude's own prose defaults lean on it far more than natural character dialogue does.

## 2026-09-21 — Removed unused leaderboard run-locking

- The guessing-game leaderboard's per-run "locked name" mechanism (added 2026-09-19) was dead code: no client component ever passed the `runId` it depended on, and the public leaderboard only ever shows one name per account/guest, never per run, so there was nothing for a lock to protect. Removed the `game_results.leaderboard_name` column, the `runId` param and 409-conflict handling on `/api/game/leaderboard-settings`, and the now-unreachable `getClaimableRun`. A player's leaderboard name is keyed only by their account/guest identity and can be updated anytime.

## 2026-09-19 — Guessing-game leaderboard

- Added a public, opt-in leaderboard (`/leaderboard`) for the guessing game: any player whose best streak reaches the overall top 10 — signed in or guest — can claim a moderated public display name. Guest scores are bound to a persistent browser cookie, so no sign-in is needed; names are screened by Claude before publishing, and each name locks to the run that claimed it (a different name for the same run is rejected). Leaving the leaderboard removes the public name while keeping the private best. Also disambiguated `"Rosalind"` to `"Rosalind (As You Like It)"` in the character lists so game rounds can't be mistaken for the DNA researcher.

## 2026-09-19 — Landing carousel loading

- The landing header now reserves space for its character carousel while portraits load, preventing the page from jumping. Its API response sends only the 20 portraits used by the rotation, and the next portrait is warmed before it appears.

## 2026-09-19 — Admin game analytics

- Added privacy-conscious guessing-game events for successful starts, scored guesses, continued rounds, and run endings. The admin dashboard now has focused Game and Character creation tabs; both daily charts share the same controls and interaction. Game stats show 7/30/90-day activity, guess accuracy, guest share, ending reasons, and final streaks. Earlier plays cannot be backfilled.

## 2026-09-19 — Guessing game: deferred round generation, real progress, and UX polish

- The next character's persona/avatar/voice/greeting is no longer generated as part of judging a guess — a correct guess now returns immediately (just the reaction and new streak), and the actual generation only starts once the player clicks "Continue" (new `pages/api/game/continue.ts` endpoint). Previously the entire pipeline ran before the player ever saw "Correct!", which is what made that moment feel like a long, unlabeled hang.
- Both `/api/game/start` and `/api/game/continue` gained a real SSE streaming mode: the client's loading spinner now reflects genuine server-reported progress (persona/avatar/voice/reply each reporting in as they finish) instead of a fixed client-side timer that could land on the wrong label for most of the wait.
- `src/utils/gameRound.ts`'s persona/avatar/voice/reply generation was parallelized (5 sequential calls down to 3 stages) ahead of the above, since it's shared by both endpoints.
- The "Correct!" moment is now a bold, pulsing inline banner (not a modal — a modal was tried and reverted for obscuring the character's last message) that's replaced by the same staged spinner once "Continue" is clicked, matching the start screen's UX.
- Fixed a real bug where reloading the page while the "Correct!" banner was showing silently discarded the win — the transient banner state is now persisted so it survives a refresh.
- Fixed the header's streak badge showing the stale pre-round number while the "Correct!" banner already showed the new one.

## 2026-09-19 — Guessing game: message attribution and personalization fixes

- Fixed chat messages in the guessing game showing the *current* character's name/avatar for every line in the transcript, including lines from a previous round's character — a correct guess and round switch used to silently relabel the whole prior conversation.
- Fixed the visitor's own preferred name (set via the account menu) never appearing in the guessing game's chat — it always showed the generic "Me," even though ordinary chat already showed the real name there.

## 2026-09-19 — Guessing game: guess-classifier and curated-name-list accuracy fixes

- Hardened the guess classifier so a guess matching the hidden character only on a shared trait/epithet (e.g. guessing "Cleopatra" for a character merely described as "a great beauty") is no longer scored as correct — it must name the literal same individual. Rewrote the classifier's prompt with clearer structure, worked examples, and a reasoning field to improve accuracy on the smaller/faster model tier it runs on.
- Fixed five more bare/ambiguous entries in the curated character-name list that could be picked as a hidden target with zero identifying context, the same root cause as the earlier "Hero" incident: `"Beauty"`, `"David Copperfield"` (collided with the real-world illusionist), `"The Emperor"`, `"The Knight"`, and `"The Monster"` were each disambiguated with their source work. Closed a gap in the regression test that catches this class of bug — it previously only matched a bare noun exactly, never a `"The X"` form.

## 2026-09-19 — Fixed a stale TTS voice-gender validation gap

- `characterVoices.ts`'s voice validation checked only whether a voice name existed, never whether its gender actually matched — so a mismatched voice/gender pairing was never caught upfront, and silently self-healed (at a latency and cost) on every single reply for that character, forever. The validation now checks both together, matching what real synthesis actually sends.

## 2026-09-19 — Made the guessing game winnable (GitHub issue #878)

- Added `src/data/gameCharacterNames.ts`, a ~400-name curated subset of the full character list restricted to broadly recognizable figures (Greek/Roman/Norse/Egyptian mythology, Shakespeare leads, fairy tales, Sherlock Holmes, world-history household names). The game's hidden target and revealed starting character are now drawn from this pool instead of the full ~1000-entry list, whose obscure entries (minor saga figures, one-off Victorian side characters) made some rounds effectively unguessable. `/api/random-character` is unaffected — it still draws from the full list, since that flow shows the name up front.
- Retuned `generateGameCluePersonaPrompt`'s clue-pacing rules: the opening hint must now include one real, narrowing category-level fact (e.g. "a queen from ancient Egypt") instead of pure atmosphere, and follow-up answers escalate to a specific, checkable fact within the first couple of exchanges rather than holding back "across several exchanges." The previous calibration explicitly optimized for the player *not* winning on a lucky first guess; the new goal is a long streak of correct guesses, favoring that outcome over stumping the player.

## 2026-09-19 — Chat composer control order

- Moved the Send button to the far right of the chat composer, after the audio mute/stop controls, so tab order matches visual order (issue #879).

## 2026-09-18 — Character Wall archival redesign

- Removed the landing hero's now-misplaced “Type any name” instruction after the two discovery actions moved above the name field; the field placeholder and existing character-guidance link already communicate it more directly.
- Replaced the Character Wall's corkboard, pushpins, and polaroid pile with a responsive tattered-parchment mosaic: aged archive typography, deckled portrait cards reduced to image plus full wrapping name, and a matching museum-plate lightbox.
- Iterated away from an initial two-page book treatment after visual review. The final masonry collage has no spine or artificial page breaks, uses substantially more of the available width, keeps portraits compact, and removes all decorative dot/speckle overlays.
- Added an accessible floating "To top" control for the infinite gallery. It reads and listens to every browser scroll owner, including `body` (the actual owner under this app's flex-root layout), so it appears only after 360px instead of staying hidden or always visible. Clicking scrolls a marker before the app header fully to the top; the pill stays above common corner widgets/phone safe areas and respects reduced-motion preferences.
- Added a top-of-gallery Sort by select (defaulting to Recently added) and an off-by-default Group by category switch. Ordering is applied to the complete cached result set before pagination; grouping uses a stable six-part historical/fictional taxonomy and starts every category collapsed for a compact overview.
- Expanded `avatar_cache` with a nullable `category` column, taught new avatar generations to classify within their existing Claude call, and added an opt-in, null-only batch backfill command. Applied the schema expansion and backfilled all 129 eligible production rows; no recognized portrait remains uncategorized.
- Added a dedicated dark archival palette: charred parchment, warm ivory type, subdued dark print mounts, themed controls, and a matching lightbox instead of forcing the light parchment colors in dark mode.
- Replaced the wall's misleading fixed "Back to Home" label with a universal arrow + "Back" history action, since the wall is reachable from chat, the creator, and other menus; an empty history falls back safely to Home.

## 2026-09-18 — Fixed a nonsensical published character; hardened the recognition guardrail

- **Live incident:** a bare `"Hero"` character reached the public Character Wall with a nonsensical personality. Root cause: the guessing game and `/api/random-character` pick names blindly from the curated list (`src/data/characterNames.ts`) with zero Claude/copyright/recognition check, and that list contained a bare `"Hero"` entry ambiguous with the plain English word; separately, `/api/validate-character.ts`'s own curated-allowlist short-circuit checked the same list, so even a manually-typed "Hero" skipped Claude's recognition classification entirely.
- Disambiguated both real `"Hero"` entries in the curated list (`"Hero (Much Ado About Nothing)"`, `"Hero (Greek mythology)"`), matching the list's existing collision-disambiguation convention — this removes the bare word from both the game/Random pool and the allowlist short-circuit.
- Hardened `validate-character.ts`'s recognition prompt so a bare common noun/generic archetype with no other identifying detail (e.g. "Hero", "Wizard") is classified `recognized: false` even if some specific obscure character happens to share that word, as defense-in-depth for names not on the curated list.
- Added a regression test (`tests/src/data/characterNames.test.ts`) denylisting known bare archetypes so an equally-ambiguous entry can't silently slip back into the curated list.
- Deleted the stale `"hero"` row directly from the shared production `avatar_cache` table.

## 2026-09-17 to 2026-09-18 — Guessing game (chain mode), copyright/trademark moderation, and observability

- Added a "guess who" chain game (`/game`) as a second mode alongside ordinary chat: chat with a real, named character who naturally steers the conversation toward a different, hidden figure; guesses are typed into the same chat box (no separate guess control) and classified server-side on every turn. A correct guess promotes the hidden figure to be the new chat partner, continuing the chain and building a streak; a second wrong guess (or a voluntary give-up, with an in-app confirmation) ends the run and always reveals the answer.
- `app/components/ChatShell.tsx` extracted the shared chat-screen UI (header, transcript, input, audio controls) out of `ChatPage.tsx`; both the game and ordinary chat now render through the same shell instead of two independently-drifting copies.
- Fixed a real hang found in dev: `pollinationsImageGen.ts`/`cloudflareImageGen.ts`'s avatar-image `fetch()` calls had no timeout, so a stalled free/anonymous provider could hang avatar generation (and anything that calls it, like the game's round-start) indefinitely instead of degrading gracefully. Both now carry a 25s `AbortSignal.timeout`.
- Fixed the game's staged "starting…" spinner wrapping back to its first message instead of holding on the last stage while a slow request was still in flight, which read as the request having silently restarted.
- **Guessing-game refinements found during further play-testing before merge:** fixed a real round-switch bug where `roundStartIndex` leaked a prior round's own tail (its guess/reaction/Q&A) into the next round's server-side conversation history from round 3 onward — only the very first round switch happened to compute the right value. A correct guess now holds on an explicit "Continue" button before switching partners instead of advancing instantly, so the reveal gets a deliberate beat. Players can also give up by typing it directly into the chat ("I give up") in addition to the menu's Give Up button, both funneling into the same confirmation dialog.
- Consolidated the app's header/identity UX: `useAccountMenu()` (identity label, change name, admin link, sign in/out) is now used by every page including chat and the game, sign-in/out always redirects to `/` and clears any stored bot session first, and a shared `BackHomeLink` pill replaced a couple of ad-hoc "back" links. Fixed a real bug where clicking a hamburger-menu item that opened a dialog (rather than navigating) never actually closed the dropdown, plus four independent CSS bugs found while auditing the hamburger's mobile positioning.
- **Character copyright/trademark moderation system:** added a permanent allow/block list (checked before any Claude call) plus an append-only warning log and an admin `/admin/moderation` page, closing a live bug where an already-public, already-cached character (Alice Munro) could pop a fresh copyright warning on a later launch. Hardened the classification prompt after a live sweep false-positived Sherlock Holmes/Thor/Winnie-the-Pooh as copyright violations. Added a second, narrower hard-block for a real living person with a well-documented serious criminal record (never applied to historical figures or ordinary celebrity controversy); blocking a name now scrubs it from every signed-in user's own saved characters too, not just the shared avatar cache.
- Automated Prettier formatting across the pipeline (a pre-commit hook plus an auto-fixing first step in `npm run ci`) so formatting drift can no longer surface only at the very end of a full CI run.
- **Observability:** fixed a real bug where the rate limiter's `rate_limit_exceeded` log was dead code on every actual 429 (the underlying library's default handler never called `next()`); added structured per-request logging (`withRequestLog`) to every API route, persisted to a gitignored, size-rotated `logs/dev.log` in dev; and gave that file its own NDJSON format (distinct from the human-readable terminal output) so it's forward-compatible with a real log pipeline (Kibana, Datadog, etc.) later without touching the logger again.

## 2026-09-08 to 2026-09-12 — Logging cleanup, admin hardening, personalized greetings

- Replaced the last paid dependency in avatar generation with two free, no-payment-required image providers: Cloudflare Workers AI (`flux-1-schnell`, 10,000 free "neurons"/day) tried first, falling back to Pollinations.ai's uncapped anonymous tier (#855).
- Lightened `/api/health` to check provider reachability instead of running a real, billed inference/synthesis call on every request.
- Adopted Prettier across the codebase and enforced it in CI; added a JSDoc + TypeDoc documentation standard (a one-line summary on every exported function/component/hook), enforced by ESLint.
- Added an internal, privacy-conscious usage-analytics log (three low-frequency events: character validated, avatar generated, bot created) and an admin-only `/admin` stats dashboard, gated by an `ADMIN_EMAILS` allowlist that fails closed and is disabled on Preview deployments; later redesigned with derived metrics and a live-refreshing "Updated" timestamp. `/admin` now 404s outright for a non-admin instead of rendering a stats shell (#860).
- A second security-hardening pass: constant-time API-key comparison in `proxy.ts`, no more raw third-party error text surfaced from `/api/health`, a capped/escaped `/api/audio` text parameter, updated secret-scanner patterns, and a rotated `API_SECRET`.
- Added magic-link (email) sign-in alongside Google (#859).
- Standardized every API route's logging onto one structured `logEvent(level, event, message, meta)` convention, closing gaps where a few newer routes had drifted onto ad-hoc `logger.info`/`.error` calls; now ESLint-enforced so it can't regress.
- Reframed landing copy and personality generation toward "edu-tainment."
- Added the personalized-greeting name-gate (ask the visitor's own name once, use it in the character's replies and transcript), a unified `AppHeader`/`useAccountMenu`/landing carousel shared across pages, and fuzzy character-name matching so a misspelling reuses an existing avatar instead of creating a duplicate cache entry (#861).
- Added a read-only DB schema-drift guardrail (`npm run db:check`) that fails loudly if `schema.ts` declares a column the live database doesn't have yet, plus a repo PR checklist.

## 2026-09-01 to 2026-09-07 — Rebrand to Portrayal, original characters

- Added an original-character flow: when Claude doesn't recognize a submitted name as a real character, a modal collects a personality/background description before generation instead of guessing from just a made-up name.
- Rebranded the app's UI as "Portrayal," with a new period-appropriate type system and an animated wordmark.
- "Chat with this character" (from the Character Wall or the landing carousel) now launches straight into a chat — resuming a signed-in user's saved bot, or generating fresh — instead of landing on the plain creator form; fixed a duplicate `/api/bots` request race and a cancel-flow bug where backing out of a character launch didn't fully unwind.

## 2026-08-25 to 2026-08-31 — Account persistence, the Character Wall, and an immersive redesign

The biggest stretch of the project since the original rewrite: optional, additive account persistence landed in phases, alongside a public character gallery and a full chat-page redesign.

- **Account persistence (#831), phased so guest usage keeps working unchanged:** generated avatars upload to Vercel Blob for a durable URL (phase 1); Auth.js (next-auth v4) with Google sign-in on a new Drizzle/Neon Postgres foundation (phase 2); an in-page sign-in lightbox on the landing page (phase 3a); a `bots` table that persists a signed-in user's created characters plus a shared, environment-agnostic `avatar_cache` (phase 3b); and server-persisted chat history with rolling conversation-summarization checkpoints, replacing full-history re-summarization every turn (phase 3c).
- Facebook sign-in was built and briefly shipped alongside Google (#833), then fully removed the same day after discovering Meta's Business-Portfolio verification requirement has no path for an individual developer without a registered business; account linking for Google/Facebook sharing an email was fixed in between (#834).
- Redesigned the chat page as an "immersive stage," including dark-mode contrast fixes (#835).
- Redesigned the landing page and color palette (earthy clay/deep teal) and added the Character Wall (`/chars`) — a public, no-auth gallery of every recognized character portrait generated so far.
- Repo cleanup (#836 and follow-ups): fixed 42 React `act()` warnings across 9 test files, removed dead code/assets and unused dependencies, deleted duplicate tests, and defaulted to light mode.

## 2026-08-18 to 2026-08-24 — Prompt-injection hardening and API docs

- Hardened chat prompts against injection with an explicit guard and clearer persona/summary tag wrapping.
- Closed API-auth bypasses and started measuring test coverage honestly; fixed an audio path-traversal guard and shared rate-limit counters properly across routes.
- Documented every API route with `@swagger` JSDoc and published an interactive `/reference` page (Scalar) generated from it.
- Added an explicit Content-Security-Policy header.

## 2026-08 (early) — Avatar generation moves to Gemini

- Migrated avatar generation from Google Vertex AI's Imagen to Gemini (later renamed Google Cloud's "Gemini Enterprise Agent Platform").
- Added guardrails against generating images that resemble real people or copyrighted character designs.

## 2026-06 to 2026-07 — Bug fixes and the project's first documentation

- Fixed a popup blocker, proxy auth, and transcript download bugs in one pass.
- Added the project's first `CLAUDE.md`, documenting architecture and commands for AI coding agents working in the repo.

## 2026-04 to 2026-05 — Character variety and quiet maintenance

- Expanded the random/fallback character list to 100 diverse names spanning mythology and literature, and tuned avatar-generation loading-message timing.
- Swapped a placeholder profile image for a real one on the about/attribution link.

## 2026-03 — Migrating from OpenAI to Claude

- Replaced the OpenAI-based chat, personality, and voice pipeline with Anthropic's Claude API end to end (#518) — the foundation of the model-tier architecture (`text`/`text-simple`/image) the app still uses.

## 2026-01 to 2026-02 — Small fixes between dependency updates

- Safer blob handling in the request-logging API; more diverse, creative random-character suggestions; graceful response wrapping added to the chat API.
- Routine dependency updates (ESLint, ts-jest, TypeScript tooling) otherwise dominated these two months.

## 2025-12 — Smart continuation, copyright validation, test hardening

- Added "smart continuation": detecting a truncated model reply, appending a "Would you like me to continue?" prompt, and resuming seamlessly — including an AI-based check for whether the user's next message was an affirmative "yes."
- Hardened the TTS output path (strict directory checks, filename sanitization) against path traversal.
- Added the copyright/trademark warning modal and the `/api/validate-character` classification endpoint — the root of today's warning/caution/blocked-name/original-character checks.
- Added a stop-audio button and an intro-loading state; switched image-model selection between `gpt-image-1` variants.
- Added markdownlint to CI and broadened test coverage across avatar generation, voice configuration, and the bot-creation flow.

## 2025-11 — Streaming replies, summarization, a real CI pipeline

- Added SSE streaming to the chat API.
- Added conversation summarization once history exceeds a length threshold — the predecessor of today's rolling-summary checkpoint system.
- Added the first GitHub Actions CI workflow covering lint, test, coverage, and build.
- Added an agent-instructions file for AI coding agents, an early ancestor of this repo's `CLAUDE.md`.

## 2025-10 — Security lockdown and public-domain defaults

- Added a disclaimer and switched default/random characters to public-domain figures — the first move toward today's copyright-validation flow.
- Enabled direct character launch via a `?name=` URL parameter, the same mechanism the Character Wall and landing carousel still use.
- Rewrote transcript export as an HTML download that includes the character's portrait.
- Shipped a "comprehensive API security" pass: rate limiting on chat and audio, input-sanitization utilities, and Vercel-preview-aware origin middleware — the direct predecessor of today's `proxy.ts`.
- Fixed mobile keyboard and scrolling behavior around the chat input.

## 2025-09 — Secret scanning and gender-aware voices

- Added a secret-scanning CI workflow (dropped once, then reinstated for good).
- Added gender parameters to the chat/audio APIs with a deterministic voice fallback.
- Added an avatar-generation timeout with elapsed-time display in the creation UI.

## 2025-07 to 2025-08 — Extracting hooks

- Split the growing `ChatPage` component into `useChatController`, `useBotCreation`, and a standalone `VirtualizedMessagesList` — the structure the app's client code still follows.
- Added a `getValidBotFromStorage` utility and fixed voice-configuration error handling.
- August was quiet otherwise: mostly dependency maintenance and standardizing API response/error handling across endpoints.

## 2025-06-23 to 2025-06-29 — Structured logging and origin-restricted APIs

- Rewrote logging across the app onto structured `logEvent`/`sanitizeLogMeta` calls.
- Added origin-restricted API access middleware — the direct ancestor of today's `proxy.ts`.
- Restyled dark mode and globals with a Material Design 3-inspired palette.

## 2025-06-12 to 2025-06-22 — Avatar and character refinements

- Added gender support to bot creation and voice configuration.
- Shipped the bot's self-introduction on creation (#36), fixed the initial audio message not stopping (#39), and improved logging (#41).
- Refined avatar-generation prompts and model-selection logic; expanded the random-character fallback list for diversity (#26).

## 2025-06-09 to 2025-06-11 — The pivot: from a Gandalf chatbot to a character generator

In a single marathon push, the single-character "Gandalf" chatbot became a general character generator — most of the app's current shape traces back to this window.

- Bot creation and personality generation, DALL-E avatar generation, per-character voice configuration, and a random-character button.
- Dark mode, a hamburger menu, and localStorage-based bot/session persistence.
- Chat message virtualization (`react-window`) and audio caching by content hash.
- A full Jest test suite covering the new surface.
- The project was renamed twice in the same window: first to "AI Character Chatbot," then to "Character Chatbot Generator."

## 2025-05 — Security hardening, new hooks, a UI overhaul

- A major mobile-responsive CSS pass across the whole chat interface.
- Hardened per-session request logging (XSS sanitization, IP validation, log-injection and path-traversal fixes) around writing session logs to Vercel Blob.
- Introduced the `useChatScrollAndFocus` hook and split components into dedicated CSS modules.
- Added, then partly walked back, internal request authentication between routes — an early precursor of today's `proxy.ts` origin/API-key check.
- Broadened test coverage across audio, health, logging, and transcript handling.

## 2025-04 — Jest, CI, and a smarter rate limiter

- Adopted Jest as the test framework and added the first GitHub Actions workflow to run it.
- Rebuilt the rate limiter with an in-memory cache fallback; fixed a CWE-78 shell-injection vulnerability in the test runner.
- Added reply caching and refined the chat persona prompt.
- A large CSS/responsiveness pass across the chat UI (audio toggle, layout, button styling).

## 2025-03 — Structured logging, audio reliability

- Rewrote logging to a structured, piped format and added retry/backoff for transient audio-file 403/404 errors (#19, "audio concurrency").
- Fixed several CodeQL "uncontrolled data used in path expression" alerts (#11, #16).
- Re-added and stabilized text-to-speech after an earlier rearchitecture; added Vercel Speed Insights (#17).

## 2025-01 to 2025-02 — Rate limiting, real TTS, a test suite

- Added a rate limiter and moved the OpenAI key handling behind it (#10).
- Rearchitected and re-added TTS with Google Cloud auth.
- Set up Jest and wrote the project's first real test suites (audio, cache/TTS utilities).
- Fixed a string of CodeQL path-expression alerts.

## 2024 — Model upgrades and dependency maintenance

- Upgraded the underlying chat model from GPT-3.5 to GPT-4 (January), then GPT-4o (June), then GPT-4-turbo with a larger response budget (July).
- A design overhaul and restyle (March).
- The rest of the year was mostly dependency/ESLint maintenance, with a round of styling fixes in December.

## 2023 — Origins: a single-character Gandalf chatbot

- Started 2023-11-16 as `my-gandalf-chatbot`: a single Next.js page chatting as Gandalf, styled with Bootstrap.
- Shipped fast in the first two days: conversation memory, disabling input while the bot responds, a response-length cap, hiding the API key, and basic chat-history styling.
- Added Vercel Speed Insights and a user disclaimer (December).
