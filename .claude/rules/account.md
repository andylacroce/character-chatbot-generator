---
paths:
  - "src/auth/**"
  - "src/db/**"
  - "src/pages/api/bots.ts"
  - "src/pages/api/messages.ts"
  - "src/pages/api/account.ts"
  - "src/pages/api/auth/**"
  - "src/pages/api/log-message.ts"
  - "src/utils/userBlobs.ts"
  - "src/utils/getSessionUserId.ts"
  - "src/utils/environment.ts"
  - "src/app/components/HistoryPage.tsx"
  - "src/app/components/Auth*.tsx"
  - "src/app/components/SignInModal.tsx"
---

### Account persistence

Optional accounts with server-persisted bots and history, additive: guest usage works unchanged and
everything no-ops (200, empty) for guests or without `DATABASE_URL`, never a 401.

- **Auth:** Auth.js (`next-auth@4`, stable; v5's `auth()` is App-Router-only) with Google, JWT
  sessions (no `sessions` table). `src/auth/authOptions.ts` holds config;
  `src/pages/api/auth/[...nextauth].ts` mounts it in Pages Router. Use
  `src/utils/getSessionUserId.ts` in any handler needing the signed-in user, never a client-supplied
  id. `proxy.ts` bypasses its origin/key check for `/api/auth/*` (Auth.js has its own CSRF/state
  cookies, and Google's callback carries Google's Referer). `next.config.mjs`'s CSP `form-action`
  must allow `https://accounts.google.com` (Chrome enforces `form-action` against the redirect
  target, so it's otherwise blocked silently); extend it for any new provider.
- **Preview:** Google has no wildcard redirect URIs, so real sign-in works only on the production
  domain. On `VERCEL_ENV === "preview"` a stub `Credentials` provider (`id: "preview-stub"`) issues
  an unverified, non-DB session from an email string, swapped in rather than added, and guarded
  twice (excluded from `providers` and rechecked in `authorize()`).
- **Google sets `allowDangerousEmailAccountLinking: true`** (a documented next-auth v4 opt-in; see
  `authOptions.ts` before extending to any new provider). Magic-link email sign-in also exists
  (`EMAIL_SERVER` + `EMAIL_FROM`, needs `DATABASE_URL`). Facebook sign-in was built and removed
  (see `docs/decisions-history.md`).
- **DB:** Drizzle on Neon. `src/db/client.ts`'s `getDb()` is a lazy singleton; it must never
  connect at import time (`next build` bundles handlers and would fail with no `DATABASE_URL`).
  The Drizzle adapter attaches only when `DATABASE_URL` is set. Apply schema changes with
  `npm run db:push` (not in `ci`, it mutates external state).
- **`SessionProvider` lives in its own `"use client"` wrapper** (`Providers.tsx`); inline in the
  root layout it breaks `next build`'s static prerender of `/`.
- **Sign-in UI:** `AuthControl.tsx` on the landing page opens an in-page `SignInModal` (Continue with
  Google) instead of redirecting off-site with no context; the preview stub skips the lightbox.
  `authOptions.ts`'s `pages.signIn: "/auth/signin"` (`AuthSignInPage.tsx`) exists for mobile's
  sign-in bridge (no lightbox to render into). It mirrors `SignInModal`'s `signIn()` calls and
  styling in its own CSS module, hides providers via `getProviders()` when unconfigured, and reads
  `?callbackUrl=`/`?error=`.
- **Environment scoping, not separate databases:** one Neon database serves dev, Preview, and
  Production, walled by an `environment` column (`getCurrentEnvironment()` in
  `src/utils/environment.ts`, from `VERCEL_ENV`, else `"development"`). Every `bots` query must
  filter on it. Not applied to `users`/`accounts` (identity is the same everywhere) or
  `avatar_cache` (intentionally global).
- **`bots`** (`src/pages/api/bots.ts`: `POST` upsert, `GET` list most-recently-updated first) is
  wired fire-and-forget into `index.tsx`'s `handleBotCreated`, so a persistence failure never
  breaks creation. **`/history`** ("Past chats", `HistoryPage.tsx`, signed-in only, linked from the
  landing footer and account menu) lists saved characters with `formatRelativeTime`. It's named
  `history`, not `chats`, to avoid confusion with `ChatPage`/`useChatController`. Rows link to
  `/?name=<name>`, the Wall's launch point, which resumes the saved character; identity
  (name/personality/avatar/voice) restores synchronously and history catches up via `messages`.
- **Server-persisted chat history (`messages` table).** For a signed-in user's saved character,
  `chat.ts` is the source of truth for personality and history rather than trusting the client's.
  It looks up the `bots` row by `(user_id, name, environment)`; guests, no `DATABASE_URL`, or
  never-saved characters (e.g. copyright overrides) fall through to client-authoritative behavior.
  - **Rolling summary:** `bots.summary`/`summarizedThroughMessageId` replace re-summarizing from
    scratch. Each turn fetches messages after the checkpoint; if that tail exceeds 20, the oldest
    excess folds into a new summary via `summarizeConversation`'s `priorSummary` and the checkpoint
    advances. (The client already pre-trims to 20 before sending, so this DB path is what makes
    summarization real.)
  - **Write path:** after each reply path (cache hit, streaming, non-streaming),
    `finalizeChatPersistence` fire-and-forget inserts the user/bot pair and any checkpoint update;
    failures are logged and never discard a reply. The intro message goes through the same path.
  - **Read path:** `GET /api/messages?botName=` (GET-only) returns oldest-first, capped at 200.
    `useChatController.ts` seeds from localStorage instantly, then (signed in) adopts the server
    list only if longer (new device / cleared storage).
  - **Schema drift guard:** forgetting `db:push` after editing `schema.ts` broke live dev/prod twice
    (`users.preferred_name`, `avatar_cache.display_name`). `npm run db:check`
    (`scripts/check-db-schema.cjs`) regex-scans `schema.ts` columns against
    `information_schema.columns` and fails if the live DB lacks one. It runs on `predev` and in `ci`,
    is read-only, and no-ops without `DATABASE_URL` (so it's a no-op on GitHub Actions). It
    deliberately never runs `db:push`: that stays an explicit, reviewed action on a shared database.
- **Self-serve account deletion:** `DELETE /api/account` (5/min) deletes the `users` row, cascading
  through `accounts`/`bots`/`messages` and both games' account-scoped tables;
  `analytics_events.user_id` is `set null`. It also removes the email's `verification_tokens`, this
  device's guest-scoped rows in **both** games' result and leaderboard-profile tables
  (`guess_who_results`/`guess_who_guest_profiles`, `guess_who_next_results`/
  `guess_who_next_guest_profiles`, keyed by cookie so no FK cascade reaches them; mobile sends
  `x-game-guest`) plus the cookie (`clearGuestId`), and, via `userBlobs.ts`'s `deleteUserBlobs`,
  Blob avatars no remaining `avatar_cache`/`bots` row references plus the user's chat logs. A Blob
  failure after the DB delete logs `account_delete_blob_failed` but still returns success. Clients
  (web `useAccountMenu` via `ConfirmDialog.tsx`, mobile `AccountModal` → `AuthContext.deleteAccount`)
  clear personal local keys via shared `isPersonalStorageKey` (keeping dark mode, audio, GA consent,
  carousel cache) and sign out. Known gap: a JWT on another device stays decodable until expiry;
  its writes fail the `users` FK and degrade like any persistence error.
  **A new per-user table needs an `onDelete: "cascade"` FK to `users`; a new guest-scoped table
  needs an explicit delete here keyed by guest cookie,** or deletion silently misses it (a missing
  pair of Guess Who guest tables was exactly this gap, fixed 2026-09-29; `tests/pages/api/account.test.ts`
  asserts all four).
- **Deleting chats (Past chats):** `DELETE /api/bots` clears every saved character in the current
  environment; `?id=<id>` deletes one. Messages cascade; `deleteUserBlobs` removes portraits only
  those rows used, and on clear-all (`chatLogs: true`) the user's chat logs (per-account, so a
  single delete leaves them). Clients confirm, delete server-side, then remove local keys
  (`chatStorageKeys(name)` / `isChatHistoryStorageKey`).
- **`/api/audio` accepts only bare `.mp3` names** (a name without the extension made the `.txt`
  sidecar path equal the audio path) and never calls Claude to improvise a reply; it looks up a voice
  only when it must synthesize. `audioFileCleanup` deletes only file names this app creates, since the
  OS temp dir is shared.
- **Chat troubleshooting logs** (`log-message.ts`) never store IP addresses (an IP would tie an
  anonymous log to a person, which the privacy policy promises against). A signed-in user's logs
  live under `chat-logs/users/<sha256(userId)>/` (`chatLogPrefix`) so deletion can find them; guest
  logs stay at the root, unlinked. Older signed-in logs predate the prefix and can only be removed
  by hand on an email request.
- **Tracking:** [issue #830](https://github.com/andylacroce/character-chatbot-generator/issues/830)
  covers the migration; keep it current (`gh issue edit 830 --body-file`, `gh issue comment`) when
  a phase completes.
