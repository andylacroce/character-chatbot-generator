---
paths:
  - "src/pages/api/generate-avatar.ts"
  - "src/pages/api/generate-personality.ts"
  - "src/utils/avatar/**"
  - "src/config/serverConfig.ts"
---

### Avatar generation (`src/pages/api/generate-avatar.ts`)

**Free image providers only; no payment method is required.** Claude (`text-simple`) writes an
SFW image prompt from the established name, then the first provider that succeeds renders it:

1. **Cloudflare Workers AI** (`cloudflareImageGen.ts`, `@cf/black-forest-labs/flux-1-schnell`) when
   `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set. Free 10,000 neurons/day; requests
   just fail once exhausted (no paid plan configured).
2. **Pollinations.ai** (`pollinationsImageGen.ts`), anonymous, no key, no daily cap, may render a
   small watermark. Used whenever Cloudflare is unset, errors, or trips its safety filter.

Module layout (`src/utils/avatar/`): `avatarGeneration.ts` orchestrates (`getOrGenerateAvatar`,
`regenerateCachedAvatar`), `avatarPrompt.ts` is the Claude prompt step, and `avatarCache.ts` owns the shared
`avatar_cache` table, Blob uploads, and the moderation scrubs (re-exported from `avatarGeneration.ts`).
Each provider returns `null` on any failure instead of throwing, so the handler's `if (!avatarUrl)`
fallthrough chains them. **Both `fetch()` calls carry `AbortSignal.timeout(25000)`:** plain
`fetch` has no timeout, and a stalled Pollinations request once hung the game's `start`/`continue`
forever. With `VERCEL_BLOB_READ_WRITE_TOKEN`/`BLOB_READ_WRITE_TOKEN`, the image uploads to Vercel
Blob (`avatars/<uuid>.<ext>`, public) and a durable URL is returned; otherwise, or on upload
failure, a base64 data URL. Rate-limited to 5/min/IP.

- **The route re-checks moderation itself:** `generate-avatar.ts` is callable directly, so a
  blocklisted name never gets a shared or persisted portrait (content blocks get the silhouette,
  copyright blocks only the private `skipPersistence` render); the allowlist wins. A brand-new name is
  re-classified here (`characterClassifier.ts`, the same call `validate-character` makes) via
  `getOrGenerateAvatar`'s `mayPersistNew` hook, only on a cache miss; anything not blocked, recognized,
  and `warningLevel: "none"`, or any check failure, renders privately instead (fails closed).
- **`avatar_cache`** (global, deliberately not environment-scoped, or the cost savings vanish) is
  keyed by lowercased name and checked before any generation. Only real generations are cached,
  never the `/silhouette.svg` fallback. `gender` is cached too (callers need it for voice
  selection). `category` comes from the same Claude response that writes the image prompt (see
  Character Wall). Reads and writes no-op without `DATABASE_URL` or on error.
- **Fuzzy name matching happens earlier, in `generate-personality.ts`.** `generatePersonalityPrompt`
  (`src/config/serverConfig.ts`) folds up to 300 existing `avatar_cache` names into the same Claude
  call and asks for `correctedName`: the input with spelling and casing fixed, or an existing name
  when it's clearly a misspelling of one. `correctedName` flows unchanged to `/api/generate-avatar`,
  so "sherlok holmes" hits the "Sherlock Holmes" row rather than a duplicate.
- **`correctedName` also expands to the fullest commonly recognized name** ("Einstein" → "Albert
  Einstein"), via `fullNameGuidance`. Conservative on purpose: (1) never invent a surname for a
  one-name figure (Zeus, Gandalf); (2) an expansion must add real identifying information that
  resolves to one individual, never swap one vague epithet for another or produce a still-ambiguous
  title ("Buckingham" → "Duke of Buckingham"); (3) never replace a pen or stage name that is itself
  the recognized form with a birth name (Molière); (4) never guess between two similarly famous
  people (Brutus). Every downstream store inherits it: `avatarCache.displayName`/`characterName`,
  `bots.name`, and the versioned localStorage keys.
- **`avatarCache.displayName`** stores the properly-cased `correctedName` at write time, the only
  place the casing is known. `chars.ts` prefers it over its lossy regex `toDisplayName` fallback
  (which can't know "III" stays uppercase or "of"/"van" stay lowercase); it is nullable for older rows.
