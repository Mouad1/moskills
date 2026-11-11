#!/usr/bin/env sh
set -eu

failures=0

say() {
  printf '%s\n' "$1"
}

mark_failure() {
  say "agent-guard: $1"
  failures=$((failures + 1))
}

staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

# moskills-owned files are checked by `moskills doctor` (checksums), and this
# script lists the blocked phrases itself, so skip them in the phrase check.
managed_files=''
if [ -f .claude/standard/.manifest.sum ]; then
  managed_files=$(sed 's/^[^ ]*  //' .claude/standard/.manifest.sum)
fi

is_managed() {
  [ "$1" = .claude/hooks/agent-guard.sh ] && return 0
  printf '%s\n' "$managed_files" | grep -qxF -- "$1"
}

if [ -z "$staged_files" ]; then
  say 'agent-guard: no staged files to check'
  exit 0
fi

while IFS= read -r staged_file; do
  [ -n "$staged_file" ] || continue

  if git show ":$staged_file" 2>/dev/null | grep -Eq '^(<<<<<<<|>>>>>>>)'; then
    mark_failure "conflict marker found in $staged_file"
  fi

  if is_managed "$staged_file"; then
    continue
  fi

  if git show ":$staged_file" 2>/dev/null | grep -F \
    -e 'TODO: implement later' \
    -e 'TBD' \
    -e 'fake test' \
    -e 'tests passed without running' \
    >/dev/null 2>&1; then
    mark_failure "blocked placeholder phrase found in $staged_file"
  fi
done <<EOF
$staged_files
EOF

# Proof gate: a run task covering a staged file needs current proof.
# CLI order: MOSKILLS_BIN, then moskills on PATH, then npx at the installed version.
# Fails closed: runs exist and no CLI means the commit is refused.
if [ -d .moskills/runs ] && [ "${MOSKILLS_NO_COMMIT_GATE:-0}" != 1 ]; then
  if [ -n "${MOSKILLS_BIN:-}" ]; then
    set -- "$MOSKILLS_BIN"
  elif command -v moskills >/dev/null 2>&1; then
    set -- moskills
  elif command -v npx >/dev/null 2>&1; then
    version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' .moskills.json 2>/dev/null | head -n 1)
    set -- npx --yes "moskills@${version:-latest}"
  else
    set --
  fi
  if [ "$#" -eq 0 ]; then
    mark_failure 'runs exist in .moskills/runs but no moskills CLI was found to check proof. Install it (npm install -g moskills) or set MOSKILLS_BIN to its path.'
  elif ! "$@" commit-gate --staged; then
    failures=$((failures + 1))
  fi
fi

if [ -f package.json ]; then
  say 'agent-guard: suggested Node validation: npm test'
fi

if [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ]; then
  say 'agent-guard: suggested Python validation: pytest'
fi

if [ ! -f .claude/STATE.md ] || ! grep -F 'Date:' .claude/STATE.md >/dev/null 2>&1; then
  say 'agent-guard: warning: no checkpoint entry in .claude/STATE.md'
fi

if [ "$failures" -gt 0 ]; then
  exit 1
fi

exit 0