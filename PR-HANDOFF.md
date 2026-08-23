# Handoff: API auth hardening, path guard, shared rate limits

Working notes for picking this branch up locally. Delete this file before merging — it documents the change, it is not project documentation.

- **Branch:** `claude/10-min-project-improvements-v9flb3`
- **Base:** `main`
- **Commits:** 2 (`e9a92cd`, `74d8320`)
- **Diff:** 27 code and test files, +3310 / -68 (about 2900 of those lines are new tests), plus this note
- **Status:** `npm run ci` passes end to end

```bash
git fetch origin claude/10-min-project-improvements-v9flb3
git checkout claude/10-min-project-improvements-v9flb3
npm install
npm run ci
code .
```

## Why this branch exists

It started as "what would you fix in ten minutes", landed on `proxy.ts` having zero tests and two ways past it, and grew to cover everything that came out of writing those tests.

## What changed

### 1. Two auth bypasses in `proxy.ts`

`proxy.ts` is the single choke point for every `/api/*` route, and it had no test file at all.

**Prefix matching.** The production origin was compared with `origin.startsWith(allowed)`, so `https://character-chatbot-generator.vercel.app.attacker.com` matched the allow list and was let through without an API key. Origin and Referer are now parsed with `new URL()` and matched host-exact — see `isAllowedOrigin` at `proxy.ts:38` and `isAllowedHost` at `proxy.ts:26`. Parsing also handles a Referer's path, and stops an allowed host smuggled into a path or userinfo section (`https://character-chatbot-generator.vercel.app@evil.com`).

**Missing Origin.** A request with no `Origin` header passed whenever the `Host` header merely *contained* `vercel.app`. Browsers always send `Origin` on POST, so in practice this was unauthenticated `curl` access to the endpoints that spend money — `/api/chat` (Claude) and `/api/generate-avatar` (Gemini). Missing-Origin requests now pass only on a safe method from an exact first-party host (`proxy.ts:71`); everything else falls through to the API key check.

Same-origin GETs still work: browsers omit `Origin` on those, which is why `safeMethods` (`proxy.ts:21`) exists rather than requiring an Origin outright.

**Renamed:** `allowedOrigins` → `allowedHosts` (`proxy.ts:11`), since the entries are hosts now. This is still the only place to add a deployment domain. `CLAUDE.md` and `README.md` updated.

### 2. `isValidAvatarUrl` accepted `javascript:`

Found while writing transcript tests. The check only inspected URLs containing `://`, so a bare `javascript:alert(1)` was classified as a relative path and rendered straight into the transcript's `<img src>`. Scheme detection now works off the `scheme:` prefix (`pages/api/transcript.ts:238`).

Base64 image data URLs are allowed explicitly, because that is how generated avatars actually arrive from `/api/generate-avatar`. SVG data URLs are excluded — it is the one image type that can carry markup of its own.

### 3. `audio.ts` path containment guard could not fire

The "only allow files in /tmp or /public" check joined its two clauses with `&&`, so it fired only when *both* resolved paths were non-empty *and both* escaped their root. A symlink inside the temp directory that `realpathSync` followed elsewhere left the sibling public path as `""`, so the guard was unreachable and the target got served. Each path is now checked independently (`pages/api/audio.ts:296`).

**Worth a careful look:** a naive `&&` → `||` would have broken macOS. `os.tmpdir()` returns `/var/folders/…` while `realpathSync` on the file returns `/private/var/folders/…`, so comparing against the raw root would 403 every legitimate file — the old `&&` was masking that. Roots are now resolved through `realpath` first, with a fallback to the raw path (`realRoot` at `pages/api/audio.ts:36`, `escapesRoot` at `pages/api/audio.ts:48`). Both directions have regression tests.

### 4. Rate limits are now global on Vercel, unchanged locally

`express-rate-limit` defaults to an in-process MemoryStore, so on Vercel every warm instance kept its own counter and the real ceiling was `max × concurrent instances`.

`src/utils/rateLimitStore.ts` adds a Redis-backed store speaking Upstash's REST pipeline API — the protocol Vercel KV uses — over plain `fetch`, so there is no Redis socket and no new dependency in the serverless runtime.

| Environment | Store | Limits are |
| --- | --- | --- |
| Local dev, no env vars | MemoryStore | Correct: one process, one counter |
| Vercel + `KV_REST_API_*` | Redis REST | Global across instances |
| Vercel, no Redis | MemoryStore | Per-instance (unchanged, now documented) |

Local development is deliberately untouched. With no env vars set, `createRateLimitStore` (`src/utils/rateLimitStore.ts:134`) returns `undefined` and `express-rate-limit` falls back to its own MemoryStore, so `npm run dev` needs no infrastructure.

The window is anchored with `SET … PX … NX` before `INCR` so it starts at the first request rather than sliding forward on every hit; a key that loses its expiry gets re-armed (`increment` at `src/utils/rateLimitStore.ts:96`).

### 5. Coverage was measured against the wrong denominator

`jest.config.cjs` had no `collectCoverageFrom`, so the 80% global threshold only applied to files a test happened to import — an entirely untested module cost nothing. Against the real denominator the project was at **68.3% statements / 64.9% branches**, not the 80%+ CI reported.

`collectCoverageFrom` added at `jest.config.cjs:51`. Rather than lower the gate, the modules sitting at zero got tests. Now **95.1% statements / 90.2% branches**, 845 tests.

## Breaking change to review

`createRateLimiter` takes a named options object instead of positional arguments, and `name` is now required (`src/utils/rateLimit.ts:44`).

```ts
// before
createRateLimiter(10, "Too many chat requests…");

// after
createRateLimiter({ name: "chat", max: 10, message: "Too many chat requests…" });
```

The name is not cosmetic. A shared store is shared *across routes*: without the `rl:<name>:<ip>` namespace, `/api/chat` (10/min) and `/api/audio` (30/min) would draw down one counter per client and enforce whichever limit was hit first. That would have been a silent regression the moment Redis was attached. All six call sites are updated.

## New environment variables

All optional. Leave them unset for local development.

- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Vercel KV / Marketplace Redis
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Upstash directly

To actually get global limits in production, attach a Redis store in the Vercel dashboard and redeploy; the variables are injected automatically. Nothing breaks if you skip this — the limiter falls back to per-instance counters.

A store outage lets requests through (`passOnStoreError`) rather than failing them. The limiter is a throttle; `proxy.ts` is the authentication boundary and does not depend on Redis.

## Verifying it

```bash
npm run ci                                   # lint, markdownlint, type-check, coverage, build
npx jest tests/proxy.test.ts                 # the auth allow/deny matrix
npx jest tests/pages/api/audio.test.ts       # includes both symlink regression cases
npx jest tests/utils/rateLimitStore.test.ts  # both env var pairs, namespacing, failure modes
```

Coverage is enforced at 80% globally and will now fail honestly if a new module ships untested.

## Where the new tests live

| File | Covers |
| --- | --- |
| `tests/proxy.test.ts` | Allowed origins, look-alike hosts, missing-Origin matrix, API key |
| `tests/pages/api/chat.test.ts` | Streaming, cache hits, summarization, timeout race, injection guard |
| `tests/pages/api/audio.test.ts` | Both 403 paths, voice config parsing, full regeneration ladder |
| `tests/pages/api/transcript.test.ts` | Validation, HTML escaping, `isValidAvatarUrl` |
| `tests/pages/api/health.test.ts` | Claude and TTS probes, ADC fallback |
| `tests/pages/api/log-message.test.ts` | Validation, Blob and local storage, log injection |
| `tests/utils/tts.test.ts` | Credential loading, output path safety, retries |
| `tests/utils/rateLimitStore.test.ts` | Env var pairs, key namespacing, pipeline failures |
| `tests/src/config/serverConfig.test.ts` | Personality prompt construction and fallbacks |

Plus smaller suites for `config`, `get-voice-config`, `delete-audio`, `generate-personality` and `characterNames`.

## Known gaps

- **`chat.ts` module-level throw.** It still throws on import if `GOOGLE_APPLICATION_CREDENTIALS_JSON` is absent, which makes the module awkward to load in tests (see the `require` dance at the top of `tests/pages/api/chat.test.ts`). Not changed here — moving the check into the handler is a behaviour change worth deciding on separately.
- **`app/components/TestMessages.tsx` and `pages/_document.tsx`** remain uncovered. Both are small and neither is on a request path.
- **No PR opened yet.** The branch is pushed; open it from the GitHub link in the push output, or ask and I will open one.
