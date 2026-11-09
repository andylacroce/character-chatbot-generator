---
paths:
  - "src/pages/api/validate-character.ts"
  - "src/pages/api/admin/**"
  - "src/utils/moderation/character*.ts"
  - "src/app/admin/moderation/**"
  - "src/app/components/character/useBotCreation.ts"
  - "src/app/components/character/CopyrightWarningModal.tsx"
  - "packages/shared/src/useCharacterCreation.ts"
---

### Copyright/trademark validation

Bot creation is gated by a server round-trip, not just a client check:

1. `useBotCreation.ts` calls `POST /api/validate-character` with `{ characterName }`.
2. `src/pages/api/validate-character.ts` (Claude, rate-limited 30/min, schema-constrained output) classifies
   `{ level: "warning" | "caution" | "none", message?, suggestions?, blocked, recognized }`:
   "warning" = clear violation (Mickey Mouse), "caution" = possible concern (Superman), "none" = safe.
3. On warning/caution, `CopyrightWarningModal.tsx` shows the message plus public-domain
   alternatives from `GET /api/random-character`.

Changing this flow touches the API, the modal, `tests/api/validateCharacter.test.ts`, and
`tests/app/components/CopyrightWarningModal.test.tsx`.

**A name is checked against three persistent tables around the Claude call,** because a
non-deterministic classifier must never override what the app already hand-vetted (a cached,
public character once popped a fresh warning on a later launch):

- **`characterAllowlist.ts`** (`character_allowlist`) is a permanent circuit-breaker checked
  first, before Claude. Sources: the static curated list `src/data/characterNames.ts` plus an
  admin-managed table. A hit also removes any stale blocklist row for the name.
- **`characterBlocklist.ts`** (`character_blocklist`) is checked next. A hit skips Claude, scrubs
  any cached avatar, and returns a hard, non-overridable block with a generic message
  (`scrubbed: true`). Rows are added automatically when Claude classifies a name `"warning"`
  (`source: "claude"`, fire-and-forget; that first attempt still gets the ordinary overridable
  warning, only repeats hit the hard block) or `blocked: true`, and manually via
  `/admin/moderation` (`source: "admin"`). Each row has a `category`: `"copyright"` (repeat hit
  returns `warningLevel: "warning"` + `scrubbed: true`) or `"content"` (repeat hit returns
  `blocked: true`). Legacy rows default to `"copyright"`.
- **All three helpers wrap their DB calls in `safeDb`** (`src/utils/safeDb.ts`): a no-op fallback without `DATABASE_URL`, and a logged `error` plus fallback on any DB failure, so moderation never blocks creation.
- **`characterWarningLog.ts`** (`character_warning_log`) is an append-only record of every
  "warning" Claude has returned. Unlike the allow/blocklist it is never deduplicated, so it alone
  answers "what was flagged this week" and backs the "Recently warned" panel.

**`blocked: true` is a separate, non-overridable check** from the same Claude call, for (1) a
profane, slur, or sexually explicit name, and (2) a real, currently-living person with a serious,
well-documented criminal conviction or extensive credible allegations of serious criminal conduct
(the prompt carries a worked example). The second is deliberately narrow: never historical or
deceased figures however controversial, never ordinary celebrity or political controversy.
`useBotCreation.ts` short-circuits to a plain error without showing the modal's "Continue Anyway",
because every created name and portrait can land on the public `/characters` wall (and, privately, in a
user's saved characters). On a validation error, `blocked` and `warningLevel` fail open
(`false`/`"none"`), so a Claude outage doesn't block creation.

- **`scrubbed: true`** (blocklist hit, or a fresh "warning" for an already-cached name) is treated
  like `blocked`: a hard stop with "This character is no longer available".
- **Blocking scrubs everywhere:** `avatarGeneration.ts`'s `scrubCachedAvatar` and
  `scrubUserBotsByName` delete the shared cache row and every user's saved `bots` row for the name
  (case-insensitive, all users and environments; `messages` cascade). The manual admin add does the
  same immediately and defaults to `category: "content"` unless it passes `"copyright"`.
- **Fixing a bad portrait (not a block):** an admin sees "Regenerate portrait" and "Purge portrait"
  in the `/characters` lightbox (`useAccountMenu`'s `isAdmin`), both via `/api/admin/characters`.
  Purge (`DELETE`, two clicks) → `purgeCachedAvatar` deletes only the shared `avatar_cache` row (the
  tile leaves the Wall until someone recreates the name). Regenerate (`POST`, one click, one image
  generation) → `regenerateCachedAvatar` generates past the cache and upserts the row in place, so a
  failed generation (502) leaves the old portrait. Either way the old Blob image goes only if no
  saved `bots` row still uses it, and `clearCharactersCache()` (in `chars.ts`) drops the Wall's
  per-instance 60s list so a stale tile can't point at a deleted image (it showed as a broken
  image). Users' saved characters, the blocklist, and the allowlist are untouched. Admin tooling is
  web-only.
- **The prompt separates** "a name meaningful only because of one corporate work" (`warning`:
  Spider-Man, Pikachu) from "a mythological, historical, or pre-1928 figure a studio also adapted"
  (`none`: Thor, Sherlock Holmes, Winnie-the-Pooh, Hercules), with those worked examples inline.
- **`/admin/moderation`** (`src/app/admin/moderation/`: `AdminModerationView.tsx` composes `WarningLogSection.tsx` and `ModerationSection.tsx`) is one page with
  three sections: "Recently warned" (read-only, time-window filter, `GET /api/admin/warnings`, inline
  Allow/Block), "Allowed", and "Blocked" (CRUD via `POST`/`DELETE` on
  `src/pages/api/admin/{allowlist,blocklist}.ts`, plus "Move to X"). A name is never on both lists:
  each list's `POST` removes it from the other server-side, which is what makes Move and the warning
  log's buttons work. A `refreshKey` bumped on any mutation re-fetches every section. The table uses
  `table-layout: fixed` with ellipsis (one line per row) and drops Reason/Source/Added below 640px
  (icon-only actions keep `aria-label`/`title`); scrolling and stacked-card layouts were rejected.
- **Overriding a warning/caution never persists anything server-side.** `useBotCreation.ts` sets
  `skipPersistence` on the `Bot` when the user clicks "Continue Anyway". `generate-avatar.ts`
  (`bypassPersistence`) then skips `avatar_cache` and Vercel Blob (returns the base64 data URL),
  `index.tsx`'s `handleBotCreated` skips `POST /api/bots` (the character behaves like a guest's,
  localStorage only), `ChatHeader.tsx` hides Download Transcript, and the modal's disclaimer says so.

### Supported-character gate (unrecognized names)

The same validation call also returns `recognized: boolean` (an established fictional, historical,
mythological, religious, or folklore figure Claude knows; a bare common noun or generic archetype
counts as unrecognized). `false` is a non-overridable stop in shared `useCharacterCreation`: web
and mobile show the same "couldn't identify" error and never call personality, avatar, or voice
generation. It defaults to `true` on transport/server errors so a Claude outage doesn't disable
chat. Original-character creation was removed in v0.24.0. Legacy `skipPersistence` sessions are
deleted from local storage by `getValidBotFromStorage` (web) and `loadBot` (mobile) instead of
resuming.
