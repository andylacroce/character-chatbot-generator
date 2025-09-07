#!/usr/bin/env bash
set -euo pipefail

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
)

grep_patterns=$(printf "%s|" "${patterns[@]}" | sed 's/|$//')

# Files and directories to ignore from noise (README, docs, CI, scripts, gitignore entries)
exclude_regex='^(?:\.gitignore|README\.md|docs/|tests/|__mocks__/|\.github/|scripts/|\.githooks/)' 

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
