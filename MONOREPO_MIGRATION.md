# Monorepo migration — handoff doc

**Branch:** `monorepo-migration` (created from `main`, which was 4 commits behind `origin/main`
at branch-creation time — worth a `git log origin/main` check before going further, in case
those commits matter here).

This doc exists so a fresh Claude Code session opened in this repo (`character-chatbot-generator`)
has full context to pick up where a session working out of the sibling `character-chatbot-mobile`
repo left off. That session was mid-way through a full feature-parity pass for the mobile app
when it hit an architectural decision that belongs here instead — this doc is the handoff.

## How we got here

The user asked for the mobile app (`character-chatbot-mobile`) to reach full feature parity with
this web app, after a large batch of new web functionality shipped (a guessing game + leaderboard,
a character/copyright moderation system, a redesigned Character Wall, header/account-menu
consolidation, message replay). That work was planned in 7 phases (Phase 0: shared package
groundwork, Phase 1: Google auth bridge, Phase 2: account menu + signed-in data, Phase 3: staged
loading overlay, Phase 4: Character Wall sort/group + message replay, Phase 5: the guessing game
itself, Phase 6: leaderboard) — see "Resuming the mobile parity work" below for the full plan.

Two things came up mid-Phase-1 that led here:

1. **Google Sign-In has no supported path in plain Expo Go anymore.** Confirmed against the
   current SDK 57 docs: `@react-native-google-signin/google-signin` is the only
   Expo-docs-recommended path and it requires a custom dev client (native code), which conflicts
   with this project's deliberate "stays on plain Expo Go" decision. The fix landed in this repo
   instead of mobile: a backend-mediated browser-bridge OAuth flow (see "What's already built"
   below) that keeps mobile on plain Expo Go by never letting Google talk to the app directly —
   only to this backend's stable HTTPS domain.

2. **The shared-code architecture itself needed a rethink.** `character-chatbot-shared` is a
   third, separate git repo both web and mobile depend on externally. This surfaced because the
   user was actively pushing more into it (types, storage keys, copy constants) for the parity
   pass, and asked directly whether that was the right design. Research (Expo's own monorepo
   docs + a recent case study on exactly this web+mobile split) found:
   - Expo SDK 52+ (this project is on 57) has **zero-config Metro monorepo support** built into
     `expo/metro-config` — no manual `watchFolders`/`extraNodeModules` needed anymore, as long as
     the shared package is inside the same workspace/repo.
   - Critically, that benefit **only applies within the same repo** — a package in a separate git
     repo (even via a subdirectory git-dependency trick, `git+.../repo.git#branch?subdirectory=path`,
     which does exist as real npm syntax) is still just an external dependency: its own build
     step, a manual `npm install` to pick up any change, no live-reload of shared source. So a
     halfway move (just fold `shared` into this repo as a subdirectory, leave mobile external)
     wouldn't actually unlock much.
   - The real-world motivating problem — type/logic drift between separately-maintained copies —
     already happened once on this exact project: `character-chatbot-shared`'s own `types.ts`
     mistyped `ChatRequest.conversationHistory` and was missing `isIntro` entirely, causing a
     500 in the mobile app that took real debugging to find (see `character-chatbot-mobile`'s
     CLAUDE.md "Status" section for the full story). A true monorepo makes that class of bug
     structurally harder, not just less likely.

   The user chose the full monorepo path, rooted at **this** repo (not a new fourth repo) — see
   "Target layout" below.

## What's already built on this branch (uncommitted at hand-off, needs a commit)

The Google auth bridge is implemented and passes `type-check` + `lint --max-warnings=0` +
its unit test, isolated:

- `src/utils/mobileAuthState.ts` — signs/verifies a short-lived (5 min) state token carrying the
  app's own redirect URI through Google's OAuth round trip. Uses `next-auth/jwt`'s `encode`/
  `decode` under a distinct `salt` ("mobile-auth-state") so it can never be confused with a real
  session/bearer token.
- `pages/api/auth/mobile-google-start.ts` — GET, redirects to Google's OAuth consent screen.
  Validates `redirect_uri` against an allowlist (`exp://` for Expo Go dev, `character-chatbot-mobile://`
  for the app's own custom scheme — **that scheme still needs adding to
  `character-chatbot-mobile/app.json`'s `"expo"` block as `"scheme": "characterchatbotmobile"`**,
  not yet done). Placed under `/api/auth/` deliberately, since `proxy.ts` bypasses its own
  origin/API-key check for that whole path prefix (see that file's own comment) — same reason
  NextAuth's own routes live there.
- `pages/api/auth/mobile-google-callback.ts` — GET, Google's redirect target. Exchanges the
  code for tokens via `google-auth-library`'s `OAuth2Client` (already a dependency, previously
  only used for TTS auth — see `src/utils/tts.ts`), verifies the `id_token`, finds-or-creates a
  `users` row by email (same email-linking policy as `authOptions.ts`'s
  `allowDangerousEmailAccountLinking`), mints a bearer JWT with `next-auth/jwt`'s `encode()`
  (no salt — same "session token" convention the web's own cookie uses), and 302s back to the
  app's redirect URI with `?token=<jwt>`.
- `src/utils/getSessionUserId.ts` — rewritten to use `next-auth/jwt`'s `getToken()` directly
  instead of `getServerSession()`. `getToken()` already reads **either** the session cookie
  (web) **or** an `Authorization: Bearer <token>` header (mobile) with zero extra code — this
  was a nice discovery mid-implementation that simplified the original plan. Signature changed
  from `(req, res)` to `(req)`; all 11 call sites already updated (`git diff --stat` on this
  branch shows them: `bots.ts`, `chat.ts`, `game/*.ts`, `generate-personality.ts`, `messages.ts`,
  `user-profile.ts`, `adminGuard.ts`).
- `tests/utils/getSessionUserId.test.ts` — rewritten to mock `next-auth/jwt`'s `getToken`
  instead of `next-auth/next`'s `getServerSession`.
- `.env.example` — documents the new redirect URI to register in Google Cloud Console:
  `<NEXTAUTH_URL>/api/auth/mobile-google-callback`, alongside the existing
  `/api/auth/callback/google` web one. **This registration is a manual Google Cloud Console
  step the user needs to do himself** — not something achievable from code.

**Not yet done for the mobile side of this flow** (belongs in `apps/mobile` post-migration):
`expo-auth-session`'s `makeRedirectUri()` + `expo-web-browser`'s `openAuthSessionAsync()` to
actually call `mobile-google-start`, parse the token off the final redirect URL, and store it
in `expo-secure-store` under `STORAGE_KEYS.authToken` (already added to shared — see next
section). None of this existed before this session; nothing to preserve, just build it fresh
once `apps/mobile` exists here.

## Also uncommitted, in the *other* two repos (not on this branch — needs manual folding in)

**`character-chatbot-shared`** (`c:\Users\andyl\Desktop\code\character-chatbot-shared`,
uncommitted working-tree changes, not part of this branch or this repo at all yet):

- `src/types.ts` — added `CharacterCategory`, `CharsSort`, `CharsGroup`, `CharacterEntry.category`,
  `MobileGoogleAuthRequest/Response`, and the full guessing-game contract:
  `GameRoundResult`, `GameStartRequest`, `GameContinueRequest`, `GameMessageRequest/Response`,
  `GameGiveUpRequest/Response`, `GameHighScoreResponse`, `LeaderboardEntry`,
  `GameLeaderboardResponse`, `LeaderboardSettingsRequest/Response`.
- `src/storageKeys.ts` — added `authToken`, `gameGuestId`, `gameInstructionsSeen` to
  `STORAGE_KEYS`.
- `src/gameCopy.ts` — **new file**, guessing-game copy (instructions text, give-up confirmation,
  correct-banner template, CTA labels) transcribed verbatim from this repo's
  `app/components/GameInstructionsModal.tsx` and `GamePage.tsx`, so mobile can match wording
  exactly without a human re-typing it.
- `src/index.ts` — added `export * from "./gameCopy"`.
- Already built (`npm run build`) and reinstalled into `character-chatbot-mobile` once, so
  mobile's own `type-check` passes against it — but that's all local/uncommitted state in a
  third repo. **When folding into `packages/shared` here, copy these exact file contents in**
  (don't redo the type design from scratch — it's already been checked against this repo's real
  `pages/api/game/*.ts` and `pages/api/chars.ts` contracts, including field-by-field swagger
  cross-referencing).

**`character-chatbot-mobile`** (`c:\Users\andyl\Desktop\code\character-chatbot-mobile`): no code
changes yet this pass, just a `package.json`/`package-lock.json` bump from reinstalling the
shared package above. Its `git log` is small (4 commits total) per its own repo's status.

## Target layout (confirmed with the user, not yet executed)

`character-chatbot-generator` becomes the monorepo root — **not** a new fifth repo, and
**not** moving the existing web app into an `apps/web` subdirectory (open question below, but
leaning toward keeping web at repo root to avoid touching Vercel's working deploy config).
Recommended shape:

```text
character-chatbot-generator/          (repo root, npm workspaces root)
├── (existing web app files stay at root: pages/, app/, src/, public/, tests/, ...)
├── apps/
│   └── mobile/                       (character-chatbot-mobile folded in, own git history)
├── packages/
│   └── shared/                       (character-chatbot-shared folded in, own git history)
└── package.json                      (add "workspaces": ["apps/mobile", "packages/shared"])
```

### Open questions for whoever executes this (confirm with the user, don't just pick one)

1. **Keep web at repo root, or move it into `apps/web`?** Root avoids any Vercel "Root
   Directory" reconfiguration for the already-deployed production app (lower risk); `apps/web`
   is the more idiomatic/symmetric monorepo shape. Leaning root-for-now given production risk,
   but confirm.
2. **Preserve `apps/mobile`/`packages/shared` git history, or plain copy?** Both source repos
   have very little history (mobile: 4 commits; shared: check its own `git log`, likely similarly
   small) so the history-preservation payoff is modest either way. `git subtree add --prefix=apps/mobile
   <path-or-remote> <branch>` (and the same for `packages/shared`) is the right tool if history
   is wanted; note `character-chatbot-shared` has **uncommitted changes** (see above) that must
   be committed in that repo first, or manually copied in, before/instead of a subtree import.
3. **Does `packages/shared` keep its `tsc` build step (ship `dist/`), or switch to raw TS
   source** now that both Next.js (`transpilePackages`) and Metro (SDK 52+ workspace
   auto-detection) can transpile a workspace package directly? Simplifying removes a manual
   build/install step but touches how `packages/shared`'s own `jest` tests run. Not decided.
4. **CI**: mobile has its own `.github/workflows/ci.yml` (triggers on push to its own `main`).
   Once folded in, decide path-filtered jobs (only run mobile's CI when `apps/mobile/**` or
   `packages/shared/**` changes; same idea for web's existing `npm run ci`) vs. one workflow
   that always runs both. Not decided.

### Known mechanical steps once the above is settled

- Root `package.json`: add `"workspaces": ["apps/mobile", "packages/shared"]`.
- `apps/mobile/package.json`: change `"character-chatbot-shared": "git+https://..."` to a
  plain workspace-resolved range (npm auto-links by matching the `name` field — e.g. `"*"` or
  `"^0.1.0"`); drop the `git+https://github.com/andylacroce/character-chatbot-shared.git`
  remote dependency entirely.
- `next.config.*` (web, wherever it ends up): add `transpilePackages: ["character-chatbot-shared"]`
  (confirm the package name stays the same after the move — it should, `package.json`'s `name`
  field doesn't need to change).
- Mobile's Metro: check `apps/mobile/metro.config.js` for any pre-existing manual
  `watchFolders`/`resolver.extraNodeModules`/`resolver.nodeModulesPaths`/
  `resolver.disableHierarchicalLookup` overrides and delete them per Expo's SDK 52+ guidance,
  then `npx expo start --clear` to confirm auto-detection picked up the workspace.
- Re-run each app's full validation (`npm run ci` at root for web; mobile's own `npm run ci`)
  after the move, before trusting anything.

## Resuming the mobile parity work (after the migration lands)

Once the monorepo restructuring is verified working (web still builds/deploys, mobile still
runs in Expo Go, `packages/shared` changes are picked up by both without a manual reinstall),
go back to the original 7-phase parity plan, starting from Phase 1 (finish the mobile-side half
of the Google auth flow — `expo-auth-session` + `expo-web-browser` + `expo-secure-store`, see
"Also uncommitted" section above for exactly what's missing):

- **Phase 0 — shared package groundwork:** done (contents listed above, just needs folding in).
- **Phase 1 — auth bridge:** backend half done (this branch); mobile half (the actual
  sign-in-button flow) not started.
- **Phase 2 — account menu + signed-in data:** not started. New `AccountMenu.tsx` (sign in/out,
  change preferred name, privacy-policy link); wire `/api/user-profile`, `/api/bots`,
  `/api/messages` for signed-in users, guest behavior unchanged.
- **Phase 3 — shared staged-progress loading overlay:** not started. New
  `CharacterLoadingOverlay.tsx`, replacing `CreatorScreen`'s plain `loadingMessage` text;
  reused later by the game screen's round-start/continue waits.
- **Phase 4 — Character Wall sort/group + message replay:** not started. `CharWallScreen.tsx`
  gets sort (newest/oldest/name asc/desc) + group-by-category controls wired to `chars.ts`'s
  existing `sort`/`group` query params (already shipped server-side, unchanged in this window).
  `ChatScreen.tsx` gets a per-message replay icon on past bot messages, reusing the existing
  `expo-audio` playback pattern.
- **Phase 5 — Guessing Game:** not started. `GameScreen.tsx`, `useGameController.ts` (mirrors
  the web's own hook), instructions modal, give-up flow, "Correct!" banner. Confirmed the
  backend's `game/start`/`game/continue` default to plain JSON (not SSE) when `stream` is
  omitted — no backend change needed for mobile's non-streaming staged-checklist approach.
- **Phase 6 — Leaderboard:** not started. `LeaderboardScreen.tsx`, guest identity via
  `expo-secure-store` (mobile can't rely on the web's HttpOnly-cookie-based guest identity —
  `src/utils/gameGuestIdentity.ts` here reads a specific cookie name via `req.cookies`, which a
  native client can't reliably persist; **this still needs its own small backend extension**,
  analogous to the auth bridge above: let `getGuestId`/`ensureGuestId` also accept a
  client-supplied guest token via a trusted header, hashed the same way as the cookie token, for
  mobile callers. Not yet designed or built — flagged mid-session, not resolved.
- Admin UI (`/admin`, `/admin/moderation`): explicitly out of scope for mobile, by the user's own
  earlier decision — skip entirely, don't build mobile equivalents.
