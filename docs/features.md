# Feature reference

How each user-facing feature works and what it stores. For how the code is organized, see [architecture.md](architecture.md). The `.claude/rules/` files hold the deeper per-feature implementation notes.

## Contents

- [Avatar Generation](#avatar-generation)
- [API Security](#api-security)
- [Account Persistence](#account-persistence-optional)
- [Character Wall](#character-wall-characters)
- [Guessing Games](#guessing-games)
- [Report a Problem](#report-a-problem)
- [Personalized Greeting](#personalized-greeting)
- [Internal Analytics](#internal-analytics-admin)
- [Storage](#storage-client-side)

## Avatar Generation

When a character chatbot is created, the app generates a portrait avatar automatically:

1. **Prompt generation** — Claude (`claude-haiku-5-5`) receives the character name and produces a detailed, safe-for-work image prompt describing appearance, era, and artistic style.
2. **Image rendering** — free providers only, no payment method required. Cloudflare Workers AI (`@cf/black-forest-labs/flux-1-schnell`) renders it first when `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` are configured; if they're unset, or Cloudflare errors or is rejected by its own safety filter, it falls back to Pollinations.ai (free, anonymous, no API key — though its anonymous tier may render a small watermark).
3. **Display** — The result is a base64 data URL (or a durable Vercel Blob URL, if `VERCEL_BLOB_READ_WRITE_TOKEN` is configured) rendered directly in the UI; no external image hosting is required beyond that.

### Requirements

None, strictly — Pollinations.ai needs no configuration at all. Setting `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (a free Cloudflare account, Workers AI enabled) gets you the higher-quality primary provider instead of relying on the fallback for every avatar.

### Rate limit

Avatar generation is capped at **5 requests per minute per IP** because image generation calls are relatively expensive compared to text inference.

## API Security

Multi-layered protection for all API endpoints:

- **Origin Validation**: Automatic authentication for localhost, Vercel production, and preview deployments
- **API Key Authentication**: External origins require valid `x-api-key` header matching `API_SECRET`
- **Route Protection**: All `/api/*` endpoints pass through `src/proxy.ts`
- **Request Logging**: Failed authentication attempts logged for monitoring

**Custom Domains**: Update `allowedHosts` in `src/proxy.ts` when deploying to custom domains.

## Account Persistence (Optional)

The app is fully usable as a guest — nothing below is required. When `DATABASE_URL` +
`NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, users can sign in
with Google to save their characters and chat history server-side (Neon Postgres via
Drizzle ORM), so both survive across devices and browser sessions:

- **Sign-in**: A "Sign in" item in every page's account menu (`AuthControl`), using Auth.js (`next-auth@4`,
  JWT sessions, no `sessions` table). Clicking "Sign in" opens an in-page lightbox
  (`SignInModal`) with a "Continue with Google" button, rather than redirecting straight
  off-site or (Auth.js's default) a bare picker page. On Vercel preview deployments, an
  unverified stub provider stands in for Google, since OAuth redirect matching can't
  follow per-push preview URLs, and signs in immediately with no lightbox — it's a
  smoke-test aid, not a real login.
- **Magic-link sign-in (optional, alongside Google)**: set `EMAIL_SERVER` (a plain SMTP
  connection string) and `EMAIL_FROM` to also offer passwordless email sign-in —
  `SignInModal` shows it whenever the server reports the `email` provider configured.
  Works with a Gmail App Password, Resend's SMTP endpoint, or any other SMTP provider;
  see `.env.example`. Unlike Google, it has no OAuth redirect restriction, so it's
  offered on preview deployments too whenever configured.
- **Characters**: Created or resumed characters are saved to a `bots` table
  (`POST`/`GET /api/bots`) once signed in. The "Past chats" page (`/history`, linked from
  the landing page and the account menu) lists them, most recently updated first.
- **Chat history**: Once a character is saved, `/api/chat` becomes the source of truth for
  its personality and message history instead of trusting the client on every request, and
  persists each turn to a `messages` table. A rolling summarization checkpoint keeps long
  conversations cheap — most turns reuse the existing summary instead of re-summarizing from
  scratch. `GET /api/messages` lets the chat UI catch up with the server's copy on load.
- **Avatar cost sharing**: Generated portraits are cached globally by character name
  (`avatar_cache` table), shared across every user (guest or signed-in) and environment,
  since image generation is the most expensive call in the app.
- **Copyright-warning overrides are never persisted**: if a user proceeds past a
  copyright/trademark warning anyway, that character and its portrait are never saved to the
  shared avatar cache, Vercel Blob, or the user's own account — it works for that session
  only, exactly like a guest's.
- **Deleting chats**: the Past chats page (web and mobile) can delete one saved chat or clear
  them all, each behind a confirmation (`DELETE /api/bots[?id=]`). That removes the characters,
  their messages (cascade), and portraits only they used. Clearing all also removes the
  user's chat logs.
- **Chat logs**: `/api/log-message` troubleshooting logs never record IP addresses. A signed-in
  user's logs are filed under a hashed per-account Blob prefix so the deletions above can find
  them.
- **Account deletion**: signed-in users can delete their own account from the account menu
  (web) or the account screen (mobile). `DELETE /api/account` erases it immediately: the
  `users` row (which cascades to characters, chat history, and game scores), pending
  magic-link tokens, that browser's guest game identity, any Blob portrait only their
  characters used, and their chat logs. Shared cached portraits and anonymized analytics counts stay.
- **Schema changes**: apply locally with `npm run db:push` (Drizzle Kit) after pulling
  changes to `src/db/schema.ts`. Not part of `npm run ci`, since it mutates external state.

See `CLAUDE.md`'s "Account persistence" section for the full phase-by-phase design notes.

## Character Wall (`/characters`)

A public gallery of every character portrait the app has ever generated — no sign-in
required. It reads from the same global `avatar_cache` table described in
[Account Persistence](#account-persistence-optional) above, so a name only ever needs to be
generated once for it to show up here for everyone.

- **Design**: the page itself is a broad sheet of tattered parchment holding a dense,
  masonry-style collage of deckled archival prints. It uses the available width instead of
  dividing portraits into book spreads, then steps down to two columns on phones and one on
  the narrowest screens. Card shape and restrained rotation are derived from a hash of the
  character's name, so the composition stays stable across reloads.
- **Sort and group controls**: the toolbar defaults to Recently added with grouping off. It
  can order the complete collection by newest, oldest, or name, while the Group by category
  switch reveals collapsed, independently expandable sections for Historical Figures,
  Mythology, Literature, Folklore & Legend, and Religion. Sorting happens
  before API pagination, so scrolling never produces page-local ordering artifacts.
- **Long-gallery navigation**: a high-contrast floating "To top" control appears only after
  360px of actual scrolling. It listens to the body (the scroll owner in this app's flex
  layout) plus the window/document fallbacks used by other engines, then scrolls a marker
  before the app header into view. It stays clear of common lower-corner widgets and phone
  safe areas, and respects reduced-motion preferences.
- **Scales without hammering the database**: paginated (`GET /api/chars?limit=&offset=`) and
  backed by a 60-second in-process cache, so a burst of visitors scrolling through hundreds of
  portraits costs at most one database query per minute, not one per page of results.
- **Category data**: new portraits persist their category in `avatar_cache` as part of the
  existing Claude prompt-generation response. The one-time historical backfill for rows
  created before this column existed completed 2026-09-18.
- **Click a portrait to open it full-size** in a native `<dialog>` lightbox, with a "Chat with
  this character" button that launches straight into a conversation — resuming your own saved
  version of that character if you're signed in and already created one, or generating a fresh
  one otherwise. It's the same landing-page launch path as typing a name in yourself, just
  skipping straight past the form.
- **Abusive names never reach this page**: every name is checked for profane/abusive content
  as part of the same Claude-powered validation round-trip that screens for copyright
  concerns, before a character (and its portrait) can be created at all. Unlike a copyright
  warning, there's no "Continue Anyway" for this check.
- **Fuzzy name matching**: typing a slight misspelling or alternate spelling of an
  already-created character (e.g. "sherlok holmes") reuses that character's existing
  portrait and casing instead of generating a near-duplicate — Claude checks new names
  against a sample of existing ones as part of the personality-generation call it's
  already making, so this costs no extra API round trip.

## Guessing Games

Both games work for guests, persist an in-progress run across reloads, and build a streak
until the player loses or gives up.

- **Guess Who (`/guess-who`)**: the focused, quick-play mode. It shows one clue about a
  hidden character and provides a dedicated guess field. A wrong answer reveals the next,
  more specific clue; exhausting the clues ends the run. A correct answer reveals the
  portrait and starts another hidden character when the player continues.
- **Guess Who's Next (`/guess-who-next`)**: the conversation mode. The player chats with
  a visible, named character who is thinking of somebody else. Questions and guesses use
  the same chat box. One wrong guess is forgiven; a second ends the run. A correct answer
  promotes the hidden figure to the next conversation partner.
- **Stateless core play**: each game's hidden answer and round state live in its own
  signed, encrypted token held by the client. Guest play therefore needs no database or
  server-side session row, and token tampering fails closed.
- **Leaderboards (`/leaderboard`, opt-in)**: the shared page has a separate tab and top
  ten for each game. Signed-in and guest players can claim a moderated public name when
  eligible; private scores still participate in ranking without exposing identity.

## Report a Problem

Anyone, signed in or not, can report a problem with a character (its name or portrait) or with
one reply a character gave. Entry points: the Character Wall lightbox, a character page, the chat
portrait viewer, and a flag button on each character reply in chat and the guessing games (web
and mobile). The reporter picks a reason (offensive, portrait, wrong or misleading, copyright, or
other) and may add up to 500 characters of detail.

Reports land in the `content_reports` table and the admin queue at `/admin/moderation`, where an
admin can block the name, purge the portrait, or dismiss. A signed-in reporter's account id is
stored; deleting the account removes that link but keeps the report. Rate limit: 5 per minute per
IP. See `.claude/rules/reports.md` for the implementation notes.

## Personalized Greeting

Characters can greet you by name. The first time you start a conversation without one
known yet, a small skippable prompt asks what to call you — decline and it just never
asks again in that browser. Set anytime from the account menu (click your name, or
"Guest", in the header) via "Add your name" / "Change your name".

- **Guest or signed in**: guests keep it in local storage; signing in persists it
  server-side (same Neon Postgres database as [Account Persistence](#account-persistence-optional))
  so it follows you across devices.
- **Shows up everywhere**: the character's greeting, your own messages in the chat
  transcript (in place of the generic "Me"), and downloaded transcript files all use it
  live — changing your name updates already-open chats immediately, not just new ones.
- **Optional, always**: skip it and nothing changes except the character calling you
  "friend" instead of by name.

## Internal Analytics (`/admin`)

Vercel Analytics/Speed Insights (already wired into `src/app/layout.tsx`) cover cookie-free page
views and performance. Production also has consent-gated GA4 traffic/navigation metrics
(`G-W01K2YSWH4`); `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` can override that ID or enable the flow in
development. `GoogleAnalyticsConsent.tsx` does not load the Google tag until the visitor opts in,
stores only that choice locally, and lets them change it from the privacy page. The self-hosted layer below records a deliberately small set of product-usage events rather than
acting as a general-purpose observability service.

- **Why it exists**: most usage — guest sessions, likely the majority of traffic since
  sign-in isn't required — never touches the database at all, so without this, real usage
  is largely invisible. An `analytics_events` table (Neon Postgres, same database as
  [Account Persistence](#account-persistence-optional) above) records a handful of
  low-frequency, high-signal events: character validation outcomes, which avatar provider
  actually served an image, character-creation counts, and guessing-game starts, scored
  guesses, continued rounds, and endings. Game events store only guest status, numeric
  streaks, and fixed outcome labels. None record character names, guesses, or chat text.
- **`/admin`** is an admin-only page with separate Guessing game and Character conversations
  tabs showing aggregate counts only — no per-user or
  per-guest detail. The access check runs server-side (`isAdmin()`) and 404s
  anyone who isn't a confirmed admin before the stats view or its bundle ever renders,
  rather than loading the page and showing a "not authorized" message. Gated by the
  optional `ADMIN_EMAILS` env var (comma-separated allowlist of emails); with none set,
  nobody can access it. It's never reachable on a Vercel Preview deployment regardless of
  email match, since Preview's sign-in stub issues sessions with zero identity
  verification (see [Account Persistence](#account-persistence-optional) above).
  A time-window control (All time, Today, 7d, 30d, 90d, or a custom date range, all UTC) scopes
  every figure and chart except the Character Wall catalog, and each section says which window it
  covers. The guessing-game section has one set of figures per game (Guess Who, Guess Who's Next):
  runs, guess accuracy, exchanges to solve, streaks, guest share, and how runs end. The character
  section covers the validate-to-create funnel, saved characters and messages (signed-in users
  only), avatar providers and cache use, and the Wall catalog by category. Game analytics begin with the deployment that adds these events; earlier plays
  cannot be reconstructed from the stateless game token or personal high scores. Abandoned
  runs have no ending event, and the event counts are best effort.
- **Discoverable, if you're an admin**: a cheap `GET /api/admin/is-admin` check (no
  database query — just the same session/allowlist check the page itself enforces) lets
  the account menu show an Admin section (Stats and Moderation links) only to signed-in
  admins, instead of them being unlinked URLs you have to remember. This is a convenience, not the security
  boundary — the page and its data endpoint enforce their own access control regardless
  of whether the link is visible.
- **Fully optional**: skip `ADMIN_EMAILS` (and even `DATABASE_URL`) and nothing about the
  rest of the app changes — this is a read-only view for the app's operator, not a
  user-facing feature.

## Storage (Client-Side)

Uses safe storage wrapper at `src/utils/storage.ts` with localStorage and in-memory fallback
— this is the only storage a guest ever uses, and stays the fast-loading cache for a
signed-in user too (the server is the durable copy; see
[Account Persistence](#account-persistence-optional) above).

**Storage Keys**:

- `voiceConfig-<bot.name>` — Versioned voice configuration
- `chatbot-bot` — Current bot data
- `chatbot-history-<bot.name>` — Chat history
- `audioEnabled` — Audio toggle state
- `darkMode` — Theme preference
- `bot-session-id` — Session tracking
- `chatbot-user-name` — The visitor's own name (guests only; a signed-in user's name is
  persisted server-side instead — see [Personalized Greeting](#personalized-greeting))
- `chatbot-user-name-gate-skipped` — Set once a guest dismisses the post-creation name
  prompt, so it doesn't reappear on that browser
- `chatbot-guess-who-token` / `chatbot-guess-who-state`: the clue game's encrypted round
  token and visible clue state
- `chatbot-guess-who-next-token` / `chatbot-guess-who-next-transcript`: the conversation
  game's encrypted round token and transcript
- `chatbot-guess-who-instructions-seen` / `chatbot-guess-who-next-instructions-seen`:
  each game's one-time "how to play" gate
- `chatbot-landing-carousel-cache`: the landing carousel's last portrait sample, shown
  instantly on the next visit
- `portrayal-google-analytics-consent`: whether the web visitor allowed or declined the optional
  Google Analytics integration; it contains no identifier or personal information

Every key lives once in `packages/shared/src/storageKeys.ts`, which both the web app and
the mobile app import.

**Important**: Never store secrets or PII in client storage. All data is client-side only.
