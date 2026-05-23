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

if [ -z "$staged_files" ]; then
  say 'agent-guard: no staged files to check'
  exit 0
fi

while IFS= read -r staged_file; do
  [ -n "$staged_file" ] || continue

  if git show ":$staged_file" 2>/dev/null | grep -Eq '^(<<<<<<<|>>>>>>>)'; then
    mark_failure "conflict marker found in $staged_file"
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