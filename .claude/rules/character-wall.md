---
paths:
  - "src/pages/api/chars.ts"
  - "src/app/characters/**"
  - "src/app/components/character/CharsGallery.tsx"
  - "src/app/components/character/PortraitMosaic.tsx"
  - "src/app/components/character/GalleryLightbox.tsx"
  - "src/app/components/character/useGallery*.ts"
  - "src/app/components/character/useBackToTop.ts"
  - "src/app/components/character/charsGalleryHelpers.ts"
  - "src/app/components/character/BotCreator.tsx"
  - "src/app/components/character/useUrlLaunch.ts"
  - "src/utils/moderation/charactersWall.ts"
  - "src/app/sitemap.ts"
  - "src/app/robots.ts"
---

### Character Wall (`/characters`)

The page route was `/chars` until v0.29.1 and still redirects (`next.config.mjs`); the API stays `/api/chars` because released mobile builds call it.

A public, no-auth gallery of every supported portrait in `avatar_cache` (anyone can already
discover a row by typing its name, so nothing new is disclosed). Every
`avatar_cache` row is recognized (legacy unsupported rows were deleted), so `chars.ts` no longer filters.

- **`avatar_cache.category`** (`packages/shared/src/characterCategories.ts`) is a nullable taxonomy
  of six identifiers: `history`, `mythology`, `literature`, `folklore`, `religion`, `other`; missing
  or unknown values degrade to `other`.
- **`chars.ts`** is `GET`-only, paginated (`limit`/`offset`, default 60, max 100, `hasMore`).
  `sort`: `newest` (default), `oldest`, `name-asc`, `name-desc`; `group`: `none` (default) or
  `category` (taxonomy order primary, sort secondary). The full list is ordered before pagination
  and held in a per-instance 60s in-process cache (`getAllCharacters()`), so infinite scroll costs
  at most one table scan a minute per warm instance (same tradeoff class as the rate limiter's
  MemoryStore). `?name=` resolves a single entry; `sample=N` returns N of the newest `limit`.
- **`CharsGallery.tsx`** (state split into `useGalleryPages`, `useGalleryLightbox`, `useBackToTop`; tiles in `PortraitMosaic.tsx`, dialog in `GalleryLightbox.tsx`): a slim Sort-by select and Group-by-category switch; grouping reloads from
  offset zero with all categories collapsed, and stale in-flight responses are ignored. One
  tattered-parchment surface with a CSS multi-column masonry of two to six columns (never one, even
  under 380px); each tile's aspect ratio and rotation come from a djb2 hash of the name
  (`hashString`) so pagination never reshuffles. A `.dark`-scoped charred-parchment palette follows
  the app theme. Infinite scroll uses a callback ref + `IntersectionObserver` on the
  conditionally-rendered sentinel (a mount-time ref effect would miss it). "To top" reads `body`,
  window, `documentElement`, and `scrollingElement` (`body` is the real scroll owner under the
  flex-root layout), appears after 360px, and uses `scrollIntoView()` on a marker before the
  header. A native `<dialog>` lightbox is wrapped in the View Transitions API when available.
- **Character pages (`/characters/[slug]`):** a server-rendered, shareable page per Wall entry
  (portrait, name, category, a "Chat with" link to `/?name=`), so a shared link previews with a
  real title, description, canonical URL, and portrait (`generateMetadata`; a data-URL portrait gets
  no image). The slug (`characterSlug` in shared) is lowercase ASCII words, so a name with no
  ASCII letters has no page; an unknown slug or a missing database is a 404 with `noindex`. The
  data read lives in `utils/charactersWall.ts` (shared with `/api/chars`). `app/sitemap.ts`
  (static pages plus one entry per slug-able character, `force-dynamic` so it is never a build-time
  snapshot, static pages only if the database read fails) and `app/robots.ts` (allows the site, hides
  `/api/`, `/admin`, `/history`, `/auth/`) point crawlers at the production origin in `utils/site.ts`.
- **Back control:** the header's arrow + "Back" calls browser history and falls back to `/` only
  when there's no same-app entry. It deliberately doesn't use `window.history.length` (a fresh tab
  already reads 2 because of `about:blank`); `src/utils/clientNavigationState.ts` holds an in-memory
  flag set by `Providers.tsx` on the first `usePathname()` change. The page uses the shared
  `AppHeader`, `BackHomeLink`, and `useAccountMenu()`.
- **"Chat with this character" links to `/?name=<encoded>`,** the same launch point
  `useUrlLaunch.ts` (used by `BotCreator.tsx`) reads via `useSearchParams()`. `isLaunchingFromUrl` hides the whole creator UI
  for a bare spinner. Resolution: signed in with a saved `bots` row of that exact name
  (case-insensitive) → resume it via `persistedBotToBot()`; otherwise `handleCreate()`.
  **StrictMode footgun, don't reintroduce:** `hasAutoSubmittedRef` is set synchronously before the
  `/api/bots` await. React 18 StrictMode double-runs effects without resetting refs, so cleanup
  during the in-flight fetch dropped the first result while the second run saw the guard set and
  bailed, hanging on the spinner forever. Fix: track a local `dispatched` flag and release the guard
  in cleanup only if nothing was dispatched. `tests/app/components/BotCreator.url.test.tsx` pins it.
