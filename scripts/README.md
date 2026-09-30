# scripts/

## Part of the ordinary build/dev/CI pipeline (always current, never delete)

- `setup-git-hooks.cjs` — `prepare`, wires up `.githooks/`.
- `generate-openapi.cjs` — `docs:api`, regenerates `public/openapi.json` before `dev`/`build`.
- `generate-theme-css.cjs` — `theme:generate`.
- `check-db-schema.cjs` — `db:check`, runs before `dev` and as part of `ci`.
- `scan-secrets.sh` — used by CI secret scanning.
