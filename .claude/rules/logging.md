---
paths:
  - "src/pages/api/**"
  - "src/utils/logger.ts"
  - "src/utils/server/rateLimit.ts"
---

### Logging standards

All server routes use structured logging, ESLint-enforced.

- **Every log line is `logEvent(level, event, message, meta)`** (`src/utils/logger.ts`), never a raw
  `logger.info/.warn/.error(string, meta)` or bare `console.*`. The `event` field makes logs
  greppable and alertable by kind.
- **Event names are `snake_case`, prefixed by route or domain:** `chat_*`, `audio_*`, `avatar_*`,
  `bots_*`, `messages_*`, `chars_*`, `admin_stats_*`, `transcript_*`, `log_api_*`, `health_*`,
  `rate_limit_exceeded`. Exception: `auth_error`/`auth_warning` carry NextAuth's own code in
  `meta.code`, since those codes aren't this app's to rename.
- **Levels:** `info` for expected lifecycle events (a reply sent, a cache hit, a routine 400);
  `warn` for recoverable or security-relevant events (a tripped rate limit, a non-admin hitting
  `/api/admin/stats`, a text/audio mismatch); `error` for real failures (a 500, discarded work, a
  broken downstream call).
- **Wrap `meta` in `sanitizeLogMeta()`** (truncates long strings, flattens nested objects). Never log
  full user-authored content (messages, replies, personality prompts, cache keys built from them) on a
  routine path; log lengths, hashes, or ids (see `chat_reply_sent`/`chat_cache_hit`). A short
  truncated snippet is acceptable only on a rare, bounded diagnostic path (`audio_text_mismatch_regen`).
- **One `logEvent` per failure,** not an `error`/`warn` pair. The one deliberate exception is
  `health.ts`: its `error` detail is gated behind `NODE_ENV !== "production"` while an unconditional
  lower-detail `info` always fires, because the endpoint is hit on every chat mount and transient
  provider blips shouldn't drive alerting. Don't collapse it without re-reading why.
- **Centralize cross-cutting logging:** 429 logging lives once in `applyRateLimit`
  (`src/utils/server/rateLimit.ts`), tagged with the limiter's `name`.
- **Enforcement:** `no-console` (scoped to `src/**`, excluding `logger.ts` and tests) plus a
  `no-restricted-syntax` rule banning `logger.info(`/`.warn(`/`.error(` in `src/pages/api/**/*.ts`.
  Client code (`src/app/components`) already uses `logEvent` exclusively; keep it that way.
- **Not mechanically enforced:** whether a *new* failure path should log at all is a judgment call,
  as is whether this file or the README needs updating. Review both deliberately before opening a PR
  (the PR template's checklist exists for this); a green `npm run ci` doesn't check either.
