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

say_err() {
  printf '%s\n' "$1" >&2
}

resolve_link() {
  self=$1
  while [ -L "$self" ]; do
    link_target=$(readlink "$self")
    case "$link_target" in
      /*) self=$link_target ;;
      *) self=$(dirname "$self")/$link_target ;;
    esac
  done
  printf '%s\n' "$self"
}

# lib/commit-gate.cjs lives in the moskills install, not in the project.
# init records that install in .claude/hooks/moskills-root. PATH and
# MOSKILLS_ROOT cover a terminal where the pointer is missing.
commit_gate_script() {
  if [ -n "${MOSKILLS_ROOT:-}" ] && [ -f "$MOSKILLS_ROOT/lib/commit-gate.cjs" ]; then
    printf '%s\n' "$MOSKILLS_ROOT/lib/commit-gate.cjs"
    return 0
  fi
  if [ -f .claude/hooks/moskills-root ]; then
    root=$(sed -n '1p' .claude/hooks/moskills-root | tr -d '\r')
    if [ -n "$root" ] && [ -f "$root/lib/commit-gate.cjs" ]; then
      printf '%s\n' "$root/lib/commit-gate.cjs"
      return 0
    fi
  fi
  if command -v moskills >/dev/null 2>&1; then
    bin=$(resolve_link "$(command -v moskills)")
    dir=$(CDPATH= cd -- "$(dirname -- "$bin")" && pwd)
    if [ -f "$dir/lib/commit-gate.cjs" ]; then
      printf '%s\n' "$dir/lib/commit-gate.cjs"
      return 0
    fi
    if [ -f "$dir/../lib/commit-gate.cjs" ]; then
      parent=$(CDPATH= cd -- "$dir/.." && pwd)
      printf '%s\n' "$parent/lib/commit-gate.cjs"
      return 0
    fi
  fi
  return 1
}

# Exit 1 when staged files have missing, failed, or stale run proof.
# No run: nothing to prove. MOSKILLS_NO_COMMIT_GATE=1 is the only skip.
check_run_proof() {
  [ "${MOSKILLS_NO_COMMIT_GATE:-0}" = 1 ] && return 0
  [ -d .moskills/runs ] || return 0
  if ! command -v node >/dev/null 2>&1; then
    say_err 'moskills commit gate: node is required to check proof'
    return 1
  fi
  gate=$(commit_gate_script) || {
    say_err 'moskills commit gate: could not find the proof check (set MOSKILLS_ROOT to the moskills install)'
    return 1
  }
  status=0
  err=$(node "$gate" --git-hook 2>&1) || status=$?
  if [ "$status" -ne 0 ]; then
    [ -n "$err" ] && printf '%s\n' "$err" >&2
    return 1
  fi
  return 0
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
  # Deletions are not in the phrase scan. A deleted proven file is still a commit.
  if ! check_run_proof; then
    exit 1
  fi
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

if [ -f package.json ]; then
  say 'agent-guard: suggested Node validation: npm test'
fi

if [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ]; then
  say 'agent-guard: suggested Python validation: pytest'
fi

if ! check_run_proof; then
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  exit 1
fi

exit 0