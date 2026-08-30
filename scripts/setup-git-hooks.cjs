#!/usr/bin/env node
// Points git at .githooks so the pre-commit secret scan (scripts/scan-secrets.sh)
// actually runs locally, not just in CI's post-push secret-scan.yml. Runs via the
// "prepare" npm lifecycle script so it self-activates on every `npm install`
// without anyone needing to remember a manual `git config` step.
const { execSync } = require('child_process');

try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  console.log('Configured git core.hooksPath -> .githooks');
} catch {
  // Not a git checkout (e.g. installed as a package, or a deploy environment
  // without .git) — nothing to wire up, and must not fail the install.
  console.log('Skipping git hooks setup (not a git working tree)');
}
