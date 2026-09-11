#!/usr/bin/env bash
set -euo pipefail

# This script scans the repository for secrets using custom logic.
# Ensure this script is executable before running it in workflows.

# Add your secret scanning logic below.
# Example: Use tools like truffleHog, git-secrets, or custom regex patterns.

# Lightweight secret scanner for staged files or the whole repo.
# Exits non-zero when likely secrets are found.

check_staged=false
if [[ "${1-}" == "--staged" ]]; then
  check_staged=true
fi

patterns=(
  "-----BEGIN (RSA |)PRIVATE KEY-----"
  "-----BEGIN ENCRYPTED PRIVATE KEY-----"
  "private_key\\"\\s*:\\s*\\"-----BEGIN"
  # Credential shapes this app actually issues/consumes (see .env.example) — the PEM
  # patterns above don't cover any of these, which are the ones actually at risk of an
  # accidental commit (e.g. a stray .env file).
  "sk-ant-[A-Za-z0-9_-]{20,}"
  "GOCSPX-[A-Za-z0-9_-]+"
  "postgres(ql)?://[^:[:space:]]+:[^@[:space:]]+@"
  "vercel_blob_rw_[A-Za-z0-9_]+"
)

grep_patterns=$(printf "%s|" "${patterns[@]}" | sed 's/|$//')

# Files and directories to ignore from noise (README, docs, CI, scripts, gitignore entries).
# .env.example is a checked-in template with placeholder values (e.g. postgres://user:
# password@host/dbname) by design — it's meant to look like the real thing, not be it.
exclude_regex='^(?:\.gitignore|README\.md|\.env\.example|docs/|tests/|__mocks__/|\.github/|scripts/|\.githooks/)'

if $check_staged; then
  files=$(git diff --cached --name-only --diff-filter=ACM)
  if [[ -z "$files" ]]; then
    echo "No staged files to scan." >&2
    exit 0
  fi
  echo "Scanning staged files for secrets..." >&2
  # Only scan files not in the exclusion list
  to_scan=$(echo "$files" | grep -vE "$exclude_regex" || true)
  if [[ -z "$to_scan" ]]; then
    echo "No staged files to scan after exclusions." >&2
    exit 0
  fi
  echo "$to_scan" | xargs -r grep -nE --color=always -e "$grep_patterns" || true
  if echo "$to_scan" | xargs -r grep -nE -e "$grep_patterns" >/dev/null 2>&1; then
    echo "Potential secret found in staged files. Commit aborted." >&2
    exit 1
  fi
else
  echo "Scanning repository for private-key markers..." >&2
  # Use git grep and filter out excluded paths to avoid README/.gitignore noise
  if git grep -nE -e "$grep_patterns" -- . | grep -vE "$exclude_regex" || true; then
    if git grep -nE -e "$grep_patterns" -- . | grep -vE "$exclude_regex" >/dev/null 2>&1; then
      echo "Potential secret found in repository. Please remove before pushing." >&2
      exit 1
    fi
  fi
fi

echo "No obvious private-key secrets found by lightweight scanner." >&2
exit 0
