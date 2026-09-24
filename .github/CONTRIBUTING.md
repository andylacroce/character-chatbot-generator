# Contributing

## Before opening a PR

- Run `npm run ci` and get it green (see [Local gate](#local-gate-npm-run-ci) below).
- Add tests for new behavior; coverage is enforced at 80%.
- Ship web and mobile changes together; shared logic belongs in `packages/shared`.
- Fill in the PR template's logging and docs checklist.

The rest of this document covers continuous integration: how changes get checked, what
blocks a merge to `main`, and how dependency updates flow in without a human reviewing
each one. If this file and a workflow or `package.json` script ever disagree, the
workflow or script is the truth; fix this document.

## The layers

A change passes through up to four checks, each cheaper and earlier than the next:

| Layer | Where | What it does |
| --- | --- | --- |
| Pre-commit hook | `.githooks/pre-commit` (installed by `npm run prepare`) | Scans staged files for secrets, auto-formats fully staged files with Prettier |
| Local gate | `npm run ci` | The full check suite for web, mobile, and shared, run before calling work done |
| GitHub Actions | `.github/workflows/` | The same checks, split into parallel jobs, on every PR and push to `main` |
| Merge rules | Repository ruleset "main: require CI" | Blocks a PR from merging until the required checks pass |

## Local gate: `npm run ci`

Run this before considering any change done. It auto-formats first (so formatting can
never be the thing that fails late), then runs, in order:

1. `format` (Prettier, writes fixes)
2. `lint --max-warnings=0` (ESLint, including JSDoc, security, and regex-safety rules)
3. `lint:md` (markdownlint; `apps/mobile` has its own)
4. `type-check`
5. Mobile's own `ci` script: `deps:check`, lint, markdown lint, format check, type-check, tests with coverage
6. Shared package tests (`packages/shared`)
7. `db:check` (schema drift against the live database; no-op without `DATABASE_URL`)
8. `docs:code` (TypeDoc; fails on a doc generation error)
9. `test:coverage` (Jest, 80% global threshold in `jest.config.cjs`)
10. `build` (production Next.js build)

## GitHub Actions workflows

| Workflow | File | Runs on | Required check(s) |
| --- | --- | --- | --- |
| CI | `ci.yml` | PR and push to `main` | `Lint & type-check`, `Test with coverage`, `Production build` |
| Mobile CI | `ci-mobile.yml` | PR and push to `main` | `Mobile CI` |
| Semgrep | `semgrep.yml` | PR and push to `main` | `Semgrep scan` |
| Secret Scan | `secret-scan.yml` | PR and push to `main` | `secret-scan` |
| CodeQL | GitHub default setup (no file) | PR and push to `main` | Code scanning rule: no error-level or high-severity alerts |
| Dependabot auto-merge | `dependabot-auto-merge.yml` | Dependabot PRs | None (it only turns on auto-merge) |
| Expo SDK upgrade | `expo-sdk-upgrade.yml` | Mondays 14:00 UTC, or manually | None (it opens a PR that goes through the checks above) |

Differences from the local gate, all deliberate:

- **Formatting is checked, not fixed.** A workflow can't cleanly rewrite the commit it is
  checking, so `ci.yml` runs `format:check` and fails on drift.
- **`db:check` doesn't run.** There are no database credentials in Actions, and the check
  only has teeth against a real database. Run it locally after any `src/db/schema.ts` change.
- **Steps are listed one by one, not through `npm run ci`.** Splitting jobs keeps
  wall-clock time down, but it means **a new step added to a `ci` script must also be
  added to the matching workflow.** Forgetting this is how v0.15.1's Expo check ran
  locally but not on GitHub.

## What blocks a merge

The "main: require CI" ruleset requires every check in the table above to pass before
a PR can merge, requires review threads to be resolved, and blocks on CodeQL alerts. The
"main: protect history" ruleset blocks force-pushes and deletion of `main`. Checks are
not required to be up to date with `main` before merging ("strict" mode is off).

## Dependency updates

Dependabot (`.github/dependabot.yml`) checks daily for the root workspace and for
`apps/mobile`. It ignores only eslint and TypeScript major versions. Everything else,
including React, React Native, and Expo packages, gets a PR, and **CI decides what
lands**: `dependabot-auto-merge.yml` turns on auto-merge, so a PR merges by itself once
the required checks pass and sits open if they don't.

### The Expo SDK check

Mobile runs in Expo Go, which ships a fixed set of native modules for each Expo SDK. A
JavaScript package newer than the native code Expo Go shipped still compiles and passes
Jest (native modules are mocked in tests), but it breaks on a real device. `deps:check`
(`expo install --check`, first step of Mobile CI) catches this by comparing every
package against the versions the installed SDK expects, so a mismatched upgrade fails a
required check and never auto-merges.

Packages that are deliberately ahead of Expo's pins and contain no native code are
excluded in `apps/mobile/package.json` under `expo.install.exclude`: `react`,
`react-dom`, `@types/react`, `jest`, `@types/jest`, `typescript`. Add to that list only
for a JS-only package you have decided to run ahead of the SDK.

### Weekly Expo SDK upgrade

Native package upgrades that fail `deps:check` wait for the next Expo SDK.
`expo-sdk-upgrade.yml` handles that every Monday: it installs the latest stable `expo`
(never a preview), runs `expo install --fix` to align every native package with it, and
opens or updates a PR on the `chore/expo-sdk-upgrade` branch with auto-merge on. If
nothing changed, no PR is opened. If the new SDK needs code changes, the PR fails CI and
stays open for a human. Dependabot closes its own PRs once they're superseded. Run it
early from the Actions tab ("Expo SDK upgrade", "Run workflow").

After an SDK upgrade merges, update Expo Go on your test device; each Expo Go release
supports only recent SDKs.

### The `EXPO_UPGRADE_TOKEN` secret

GitHub doesn't run workflows on a PR opened with the built-in `GITHUB_TOKEN`, so the
upgrade PR would never get its required checks and could never merge. The workflow uses
a fine-grained personal access token instead. To create or rotate it:

1. GitHub, profile picture, **Settings**, **Developer settings**, **Personal access
   tokens**, **Fine-grained tokens**, **Generate new token**.
2. Name it (e.g. `expo-sdk-upgrade`), set an expiration (a year is reasonable; GitHub
   emails before it expires).
3. **Repository access:** Only select repositories, `character-chatbot-generator`.
4. **Repository permissions:** Contents: Read and write. Pull requests: Read and write.
   (Metadata: Read-only is added automatically.) Nothing else.
5. Generate and copy the token.
6. In the repo: **Settings**, **Secrets and variables**, **Actions**, **New repository
   secret**, name `EXPO_UPGRADE_TOKEN`, paste the token.

Or from a terminal: `gh secret set EXPO_UPGRADE_TOKEN` and paste when prompted.

When the token expires, the workflow fails at the "Open PR" step; repeat the steps above.

## Troubleshooting

- **Mobile CI fails at "Check native deps match the Expo SDK":** a package doesn't match
  the installed Expo SDK. On a Dependabot PR, leave it; the weekly upgrade will supersede
  it. On your own change, run `npx expo install --fix` in `apps/mobile`.
- **`format:check` fails on GitHub but the diff looks empty:** usually a CRLF line ending.
  `.gitattributes` forces LF; renormalize with `git add --renormalize .`.
- **Everything passes locally but a GitHub job fails:** check whether the step exists in
  the workflow at all (see the "one by one" note above), and whether it depends on
  something only your machine has (`.env`, `DATABASE_URL`).
