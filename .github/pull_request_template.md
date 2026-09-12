<!--
This checklist exists because two things in this repo can't be mechanically
enforced the way lint/type-check/tests are: whether a new failure path got a
logEvent call (see CLAUDE.md's "Logging standards"), and whether CLAUDE.md/
README still describe the app accurately after this change. Both are easy to
skip under "ship it" pressure, so this asks explicitly, every time.
-->

## Summary

## Logging

- [ ] Every new/changed `pages/api/*.ts` failure path (`catch` blocks, non-2xx
      responses) logs via `logEvent(level, event, message, meta)` — see
      CLAUDE.md's "Logging standards" — or there's a specific reason it
      shouldn't (e.g. a purely cosmetic client-side fetch failure).
- [ ] No raw `console.*` or `logger.info/.warn/.error(string, meta)` introduced
      (lint already blocks this, but double-check anything lint doesn't scope).

## Docs

- [ ] `CLAUDE.md` reflects this change (new/renamed files, changed behavior,
      new env vars, new scripts) — or nothing here needed it.
- [ ] `README.md` reflects this change (Key Features, Storage Keys, Project
      Structure, env var tables) — or nothing here needed it.
- [ ] `npm run db:check` passes locally if `src/db/schema.ts` changed (and
      `npm run db:push` has actually been run against the real database).

## Test plan
