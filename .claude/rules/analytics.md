---
paths:
  - "src/utils/analytics.ts"
  - "src/app/api/admin/stats/route.ts"
  - "src/utils/admin/**"
  - "src/app/admin/**"
  - "src/utils/account/isAdmin.ts"
  - "src/app/components/common/GoogleAnalyticsConsent.tsx"
---

### Internal analytics (`/admin`)

Vercel Analytics/Speed Insights (`layout.tsx`) cover cookie-free page views and performance.
Production Google traffic analytics use the public GA4 stream `G-W01K2YSWH4`
(`NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` overrides it or enables the flow in development); the built-in ID
applies only when `VERCEL_ENV === "production"`, so previews and a local `next start` never report
into the live stream. `GoogleAnalyticsConsent.tsx` validates the ID shape and loads
`@next/third-parties` only after the visitor opts in. The choice is stored under
`STORAGE_KEYS.googleAnalyticsConsent`, synced across tabs, and editable on `/privacy`; opting out
also sets `ga-disable-<id>` and pushes a Consent Mode denial. Google Tag Manager was removed
2026-09-24 as unused; if re-added, don't publish a GA4 tag for this ID in it (double counting) and
don't server-render its `<noscript>` iframe (contacts Google without consent). CSP still allows
`googletagmanager.com` because `gtag.js` is served from there. The database layer below is separate
product-usage analytics, kept small rather than becoming general observability.

- **`analytics_events`** is an append-only log (`name`, `environment`, nullable `userId` where null
  means guest, `metadata` jsonb). It exists because guest usage never touches `bots`/`messages`.
  `recordEvent()` (`src/utils/analytics.ts`) never throws and no-ops without `DATABASE_URL`. **Always
  `await` it:** an un-awaited insert can be frozen with the function after the response is sent and
  fail on the next invocation (it undercounted wrong guesses).
- **Events** (low-frequency, high-signal, only after success): `character_validated`,
  `avatar_generated` (provider: `cache` | `cloudflare` | `pollinations` | `none`), `bot_created`,
  and the game events above. No event records character names, guesses, or chat text, preserving
  `skipPersistence`'s no-trace guarantee.
- **`GET /api/admin/stats`** (a thin handler; the queries live in `src/utils/admin/`: `gameStats.ts` for
  one game's aggregation, shared by both games, `characterStats.ts`, and `adminStats.ts`'s `loadAdminStats`
  that combines them) aggregates the current environment: game starts (today/7d/all time),
  guest share, scored guess accuracy, continued rounds, ending reasons, streak distribution, and 90
  days of daily activity. `/admin` has keyboard-operable tabs (Guessing game, Character
  conversations) and a time-window control (`?window=today|7d|30d|90d` or `?from=&to=`, UTC, parsed
  by `parseTimeRange`) that scopes every figure except the all-time Wall catalog; the daily charts
  (`AdminActivityChart`) end at the window's end and keep their own 7/30/90-day zoom.
  Saved messages are counted for the characters saved in the window, so the per-character average
  divides like by like. Figures
  start when instrumentation deployed (no backfill: tokens hold no history, and abandoned runs emit
  no event). Writes are best effort, so counts can include retries and aren't a unique-run ledger.
- **Access:** `/admin` (`src/app/admin/page.tsx`) and `/admin/moderation` are unlinked-but-reachable
  and use the shared `AppHeader`/`useAccountMenu`. `src/utils/account/isAdmin.ts` admits a signed-in session
  whose email is in `ADMIN_EMAILS` (comma-separated) and **fails closed** (no list, no admins), the
  opposite default of other optional features because it grants read access to aggregate activity.
  The admin pages 404 a non-admin (`notFound()` via `isAdmin()`) rather than rendering a shell.
  **Never honored on a Vercel Preview deployment,** since the stub provider signs in any typed
  email unverified; `isAdmin()` checks `VERCEL_ENV === "preview"` first. The API returns 401 with
  no session and 403 when not listed, before any DB query; the page's `useSession()` check is UX
  only. `GET /api/admin/is-admin` (DB-free, 30/min, always `200 { isAdmin }`, not a security
  boundary) drives the menu's Admin links, called only while authenticated.
