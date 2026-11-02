---
paths:
  - "src/app/components/AppHeader*"
  - "src/app/components/useAccountMenu.tsx"
  - "src/app/components/LandingCharacterCarousel.tsx"
  - "src/app/components/HamburgerMenu*"
  - "src/app/components/BackHomeLink.tsx"
  - "src/app/components/Providers.tsx"
---

### Unified header

`AppHeader.tsx` is the one header for chat, game, landing, and the Wall: `{ menuItems, menuSide?,
center, extra? }` with a plain 3-bar hamburger. Its CSS module carries only the generic shell
(sticky bar, left/center/right grid); page-specific content lives in that page's own module, per
the "no shared CSS modules" rule (descendant selectors leaking across components; a genuinely
atomic single-class rule such as `.menuDivider` lives once in `globals.css` by literal class name).

- **No identity-chip trigger.** The dark-mode toggle and (where a page's items include it) the
  signed-in identity are folded into the hamburger dropdown, which `AppHeader.tsx` appends after
  each caller's `menuItems` (a mobile header can't fit a name, avatar, toggle, and chip in ~390px).
- **`useAccountMenu.tsx`** returns `{ userNameCtx, menuItems, modals, requestSignIn }` and is used by
  `BotCreator`, `CharsGallery`, `ChatPage`, and `GamePage` (page items first, then a `menuDivider`).
  `menuItems` leads with a non-interactive identity label ("Guest" or name/email), then change-name,
  an "Admin" sub-section (Stats `FaUserShield`, Moderation `FaBan`) when `GET /api/admin/is-admin`
  reports true, then `<AuthControl onRequestSignIn={requestSignIn}>`. `modals` renders one shared
  `NameCaptureModal` and one `SignInModal` per page.
- **Slots:** `BotCreator`'s `center` is the "Portrayal" wordmark + Beta badge (the carousel is now the page backdrop, below); `CharsGallery`'s is a
  `BackHomeLink` pill (`BackHomeLink.tsx`, also on the game start screen); chat and game (via
  `ChatShell.tsx`) use `menuSide="left"` with the character's avatar + name as `center` and a
  personal brand link as `extra`.
- **Signing in or out always redirects to `/`** (every `signIn`/`signOut` passes `callbackUrl:
  "/"`), since both are reachable mid-chat. `callbackUrl` alone isn't enough: `index.tsx`'s `Home`
  renders `ChatPage` whenever a bot session is in localStorage, so `clearStoredBot()` runs just before
  the Google/preview-stub `signIn()` and `signOut()` (not magic-link, which doesn't navigate).
- **`LandingCharacterCarousel.tsx`** is the landing page's backdrop: a fixed full-page portrait
  (rotating through recognized characters via `GET /api/chars?limit=100&sample=20`; the API
  samples, so the client doesn't download unused portraits, including large base64 URLs) under a
  light theme-colored veil, behind the translucent panels (62% surface, 3px blur; the blur was
  tried at 10px and rejected). The image layer ignores pointer events so the form stays usable;
  the name pill under the header's right edge (aligned to the 1080px content column) is the only
  control, pausing rotation on hover/focus and linking to `/characters?name=<encoded>`, which
  `CharsGallery` resolves via `GET /api/chars?name=...` and opens in the lightbox. It advances
  every 6s and preloads the next portrait. Applies at every width (the header carousel it
  replaced was removed). **The empty state paints the cached sample first:** the last sample
  lives in `localStorage` (`landingCarouselCache`), read in the same effect as the fetch (not a
  lazy `useState` initializer, which would hydration-mismatch); a fresh non-empty response
  replaces both, and an empty or failed fetch keeps the cache. With no data it renders nothing.
- **The landing page is a responsive dashboard:** the launcher is the dominant panel and both
  games a compact secondary panel. At 820px and below it is one column; game cards stay side by
  side on phones and stack only below 340px. Spacing and type use clamps; the form scroller is the
  short-viewport fallback. Dark mode removes the light theme's ambient wash and shadows for flat
  solid surfaces with borders.
- **CSS specificity gotcha:** a generic `.headerCenter > button { display: block }` in the shared
  `AppHeader.module.css` (0,1,1) once beat the carousel's own `.carousel { display: flex }` (0,1,0)
  because its root is also a `<button>` there, collapsing the layout. The rule was moved to the
  specific `.avatarButton` in `ChatPage.module.css`. A broad selector in a shared module can break
  an unrelated component with the same DOM shape.
