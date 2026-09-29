# scripts/

## Part of the ordinary build/dev/CI pipeline (always current, never delete)

- `fix-express-tsconfig.cjs` — `postinstall`.
- `setup-git-hooks.cjs` — `prepare`, wires up `.githooks/`.
- `generate-openapi.cjs` — `docs:api`, regenerates `public/openapi.json` before `dev`/`build`.
- `generate-theme-css.cjs` — `theme:generate`.
- `check-db-schema.cjs` — `db:check`, runs before `dev` and as part of `ci`.
- `scan-secrets.sh` — used by CI secret scanning.

## One-time data migrations (opt-in, run manually against production data)

These classify or rewrite existing `avatar_cache`/`bots`/log rows via a Claude call and are
**not** run automatically by `dev`, `build`, or `ci`. Each supports `--dry-run`. See
`CLAUDE.md`'s relevant section for full behavior/guardrails before running one against
production. Once a script's one-time job is fully done and confirmed (check CLAUDE.md for
a "ran on \<date\>, N rows filled" note), delete it — don't leave fully-consumed scripts
sitting here indefinitely.

- `chars:backfill-display-names` (`backfill-avatar-display-names.cjs`) — fill `display_name`
  for legacy rows missing one.
- `chars:backfill-full-names` (`backfill-full-character-names.cjs`) — expand legacy names to
  their fullest commonly recognized form (renames the `character_name` primary key).
- `chars:scrub-copyrighted` (`scrub-copyrighted-avatar-cache.cjs`) — retroactive sweep to
  blocklist/delete existing copyrighted `avatar_cache` rows. Held pending prompt fixes as of
  this writing — see CLAUDE.md's copyright-validation section.
- `chars:scrub-unrecognized` (`scrub-unrecognized-characters.cjs`) — delete legacy
  `recognized = false` cache rows, matching saved bots/messages, and unreferenced Blob images
  after original-character creation was retired. Run once, verify, then remove the script.
- `logs:scrub-ips` (`scrub-chat-log-ips.cjs`) — strip IP addresses from chat logs written
  before IP logging was removed.
