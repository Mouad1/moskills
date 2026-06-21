# Agentic Skill Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shell-installed agentic skill plugin repository that installs both slash commands and reusable skill folders into any project.

**Architecture:** Keep source templates under `templates/claude/`, copy them into target projects with `setupskill.sh`, and verify behavior with dependency-free shell smoke tests. Commands stay thin and user-facing, skills hold workflow detail, and `CLAUDE.md` routes agents with progressive disclosure.

**Tech Stack:** POSIX shell, Git hooks, Markdown templates, dependency-free shell tests.

---

## File Structure

- Create: `setupskill.sh`
  - Shell installer with argument parsing, stack detection, safe copy behavior, dry run, force mode, and optional Git hook installation.
- Create: `tests/run-tests.sh`
  - Dependency-free smoke test runner using temporary directories.
- Create: `templates/claude/CLAUDE.md`
  - Router instructions that explain when to use each installed command and skill.
- Create: `templates/claude/STATE.md`
  - Persistent state template with required sections.
- Create: `templates/claude/commands/align-intent.md`
- Create: `templates/claude/commands/system-map.md`
- Create: `templates/claude/commands/checkpoint.md`
- Create: `templates/claude/commands/gatekeeper.md`
  - Slash command wrappers that point to matching skills and define compact outputs.
- Create: `templates/claude/skills/align-intent/SKILL.md`
- Create: `templates/claude/skills/system-map/SKILL.md`
- Create: `templates/claude/skills/checkpoint/SKILL.md`
- Create: `templates/claude/skills/gatekeeper/SKILL.md`
  - Reusable workflow skills, one responsibility each.
- Create: `templates/claude/hooks/agent-guard.sh`
  - Shared guardrail script for conflict markers, risky placeholders, and validation suggestions.
- Create: `templates/claude/hooks/pre-commit`
  - Small pre-commit wrapper that calls `.claude/hooks/agent-guard.sh`.
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `LICENSE`
- Create: `docs/lifecycle.md`
- Create: `docs/command-reference.md`
- Create: `docs/pain-points.md`
- Create: `docs/examples/node-project.md`
- Create: `docs/examples/python-project.md`
  - User documentation.
- Create: `tasks/todo.md`
  - Project workflow tracker that points to this plan.

## Task 1: Add Test Harness And Initial Installer Contract

**Files:**
- Create: `tests/run-tests.sh`
- Create: `setupskill.sh`

- [ ] **Step 1: Write failing smoke tests for generic install and dry run**

Create `tests/run-tests.sh` with this content:

```sh
#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP_ROOT="${TMPDIR:-/tmp}/moskills-tests-$$"

pass_count=0

cleanup() {
  rm -rf "$TMP_ROOT"
}

trap cleanup EXIT INT TERM

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  pass_count=$((pass_count + 1))
  printf 'PASS: %s\n' "$1"
}

assert_file() {
  test -f "$1" || fail "expected file: $1"
}

assert_not_exists() {
  test ! -e "$1" || fail "expected path to be absent: $1"
}

assert_contains() {
  file=$1
  text=$2
  grep -F "$text" "$file" >/dev/null 2>&1 || fail "expected '$text' in $file"
}

make_project() {
  name=$1
  mkdir -p "$TMP_ROOT/$name"
  printf '%s\n' "$TMP_ROOT/$name"
}

run_installer() {
  sh "$ROOT_DIR/setupskill.sh" "$@"
}

test_generic_install_creates_claude_files() {
  project=$(make_project generic-install)
  run_installer --target "$project" >/tmp/moskills-test-output.txt

  assert_file "$project/.claude/CLAUDE.md"
  assert_file "$project/.claude/STATE.md"
  assert_file "$project/.claude/commands/align-intent.md"
  assert_file "$project/.claude/commands/system-map.md"
  assert_file "$project/.claude/commands/checkpoint.md"
  assert_file "$project/.claude/commands/gatekeeper.md"
  assert_file "$project/.claude/skills/align-intent/SKILL.md"
  assert_contains /tmp/moskills-test-output.txt 'Installed commands:'
  pass 'generic install creates .claude files'
}

test_dry_run_writes_nothing() {
  project=$(make_project dry-run)
  run_installer --target "$project" --dry-run >/tmp/moskills-test-output.txt

  assert_not_exists "$project/.claude"
  assert_contains /tmp/moskills-test-output.txt 'Dry run enabled'
  assert_contains /tmp/moskills-test-output.txt 'Would create directory'
  pass 'dry run writes nothing'
}

mkdir -p "$TMP_ROOT"
test_generic_install_creates_claude_files
test_dry_run_writes_nothing

printf 'All tests passed: %s\n' "$pass_count"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```sh
sh tests/run-tests.sh
```

Expected: FAIL because `setupskill.sh` and templates do not exist yet.

- [ ] **Step 3: Add minimal installer skeleton**

Create `setupskill.sh` with this initial content:

```sh
#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TEMPLATE_DIR="$SCRIPT_DIR/templates/claude"
TARGET_DIR=$(pwd)
FORCE=0
DRY_RUN=0
WITH_HOOKS=0

usage() {
  cat <<'USAGE'
Usage: setupskill.sh [options]

Options:
  --target <path>   Install into a specific project path.
  --force           Overwrite existing managed files.
  --dry-run         Print planned actions without writing files.
  --with-hooks      Install Git hook files when possible.
  --help            Show usage.
USAGE
}

log() {
  printf '%s\n' "$1"
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || die '--target requires a path'
      TARGET_DIR=$2
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --with-hooks)
      WITH_HOOKS=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[ -d "$TARGET_DIR" ] || die "target directory does not exist: $TARGET_DIR"
[ -d "$TEMPLATE_DIR" ] || die "template directory not found: $TEMPLATE_DIR"

copy_file() {
  src=$1
  dest=$2
  dest_dir=$(dirname "$dest")

  if [ -e "$dest" ] && [ "$FORCE" -ne 1 ]; then
    log "Skip existing file: $dest"
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would create directory: $dest_dir"
    log "Would copy: $src -> $dest"
    return 0
  fi

  mkdir -p "$dest_dir"
  cp "$src" "$dest"
}

install_tree() {
  find "$TEMPLATE_DIR" -type f | while IFS= read -r src; do
    rel=${src#"$TEMPLATE_DIR/"}
    case "$rel" in
      hooks/pre-commit)
        continue
        ;;
    esac
    copy_file "$src" "$TARGET_DIR/.claude/$rel"
  done
}

if [ "$DRY_RUN" -eq 1 ]; then
  log 'Dry run enabled'
fi

install_tree

if [ "$WITH_HOOKS" -eq 1 ]; then
  log 'Hook installation will be implemented in the hook task.'
fi

cat <<'DONE'
Installed commands:
  /align-intent
  /system-map
  /checkpoint
  /gatekeeper
DONE
```

- [ ] **Step 4: Make installer executable**

Run:

```sh
chmod +x setupskill.sh
```

Expected: command exits with status 0.

- [ ] **Step 5: Run tests to verify partial progress**

Run:

```sh
sh tests/run-tests.sh
```

Expected: FAIL because templates do not exist yet. This confirms the installer is present but needs template files.

## Task 2: Add Core Templates For Commands, Skills, Router, And State

**Files:**
- Create: `templates/claude/CLAUDE.md`
- Create: `templates/claude/STATE.md`
- Create: `templates/claude/commands/align-intent.md`
- Create: `templates/claude/commands/system-map.md`
- Create: `templates/claude/commands/checkpoint.md`
- Create: `templates/claude/commands/gatekeeper.md`
- Create: `templates/claude/skills/align-intent/SKILL.md`
- Create: `templates/claude/skills/system-map/SKILL.md`
- Create: `templates/claude/skills/checkpoint/SKILL.md`
- Create: `templates/claude/skills/gatekeeper/SKILL.md`

- [ ] **Step 1: Extend tests for command-to-skill links**

Append these helper checks to `tests/run-tests.sh` before the final `printf` line:

```sh
test_commands_point_to_matching_skills() {
  project=$(make_project command-links)
  run_installer --target "$project" >/tmp/moskills-test-output.txt

  assert_contains "$project/.claude/commands/align-intent.md" 'Use skill: align-intent'
  assert_contains "$project/.claude/commands/system-map.md" 'Use skill: system-map'
  assert_contains "$project/.claude/commands/checkpoint.md" 'Use skill: checkpoint'
  assert_contains "$project/.claude/commands/gatekeeper.md" 'Use skill: gatekeeper'
  pass 'commands point to matching skills'
}

test_skills_have_single_primary_goal() {
  project=$(make_project skill-goals)
  run_installer --target "$project" >/tmp/moskills-test-output.txt

  assert_contains "$project/.claude/skills/align-intent/SKILL.md" 'Primary goal: Ensure agreement before coding.'
  assert_contains "$project/.claude/skills/system-map/SKILL.md" 'Primary goal: Show module relationships before changes.'
  assert_contains "$project/.claude/skills/checkpoint/SKILL.md" 'Primary goal: Record a factual audit trail.'
  assert_contains "$project/.claude/skills/gatekeeper/SKILL.md" 'Primary goal: Validate work before completion.'
  pass 'skills have single primary goals'
}
```

Also add these calls before the final `printf` line:

```sh
test_commands_point_to_matching_skills
test_skills_have_single_primary_goal
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```sh
sh tests/run-tests.sh
```

Expected: FAIL because command and skill templates are missing.

- [ ] **Step 3: Create router and state templates**

Create `templates/claude/CLAUDE.md`:

```markdown
# Agent Workflow Router

Use this router to keep agent work deliberate, modular, and easy to audit.

## Lifecycle

New Feature -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done

## Commands

- Use `/align-intent` before coding when intent, scope, inputs, outputs, or success criteria are not fully agreed.
- Use `/system-map` when a task touches multiple files, modules, data flows, or boundaries.
- Use `/checkpoint` during long work, before context changes, and after meaningful file changes.
- Use `/gatekeeper` before saying work is complete.

## Rules

- Keep code modular and decoupled from business-specific logic.
- Prefer small files with one clear responsibility.
- Do not claim tests passed unless command output was observed.
- Update `.claude/STATE.md` when a command changes durable project context.
```

Create `templates/claude/STATE.md`:

```markdown
# Agent State

## Current Intent Model

No active intent model yet.

## Active System Map

No active system map yet.

## Checkpoints

No checkpoints recorded yet.

## Open Blockers

No open blockers recorded yet.

## Validation History

No validations recorded yet.
```

- [ ] **Step 4: Create command wrappers**

Create `templates/claude/commands/align-intent.md`:

```markdown
# /align-intent

Use skill: align-intent

Use this command before coding when the goal, constraints, inputs, outputs, or success criteria are not fully agreed.

Output:

```text
Input:
Action:
Output:
Success:
Non-goals:
Risks:
```
```

Create `templates/claude/commands/system-map.md`:

```markdown
# /system-map

Use skill: system-map

Use this command when architecture, module relationships, dependency direction, or change boundaries matter.

Modes:

- Zoom-Out: system-level relationships.
- Zoom-In: one module and its inputs, outputs, dependencies, and risks.
```

Create `templates/claude/commands/checkpoint.md`:

```markdown
# /checkpoint

Use skill: checkpoint

Use this command to record factual progress, Git deltas, blockers, and next steps in `.claude/STATE.md`.

Never claim tests passed unless command output was observed.
```

Create `templates/claude/commands/gatekeeper.md`:

```markdown
# /gatekeeper

Use skill: gatekeeper

Use this command before saying work is done.

It must compare observed verification results against the active `/align-intent` logic model and separate passing, failing, and unknown checks.
```

- [ ] **Step 5: Create skill files**

Create `templates/claude/skills/align-intent/SKILL.md`:

```markdown
---
name: align-intent
description: Confirm implementation intent before coding. Use when requirements, scope, inputs, outputs, or success criteria are unclear.
---

# Align Intent

Primary goal: Ensure agreement before coding.

## Steps

1. Restate the requested outcome in simple language.
2. Ask at most five targeted questions.
3. Prefer multiple-choice questions when practical.
4. Stop asking when intent, constraints, success criteria, and non-goals are clear.
5. Write the logic model.
6. Update `.claude/STATE.md` under `Current Intent Model`.

## Logic Model

```text
Input:
Action:
Output:
Success:
Non-goals:
Risks:
```

## Rules

- Do not start coding during this workflow.
- Do not ask broad questions when a targeted question would work.
- Use clear English.
```

Create `templates/claude/skills/system-map/SKILL.md`:

```markdown
---
name: system-map
description: Map module relationships and change boundaries before editing code.
---

# System Map

Primary goal: Show module relationships before changes.

## Modes

- Zoom-Out: show major modules, data flow, external dependencies, and risk areas.
- Zoom-In: show one module, its public surface, dependencies, inputs, outputs, and safe change boundary.

## Output

```text
View:
Scope:
Modules:
Data Flow:
External Dependencies:
Risk Areas:
Recommended Change Boundary:
```

## Rules

- Base the map on files that were inspected.
- Mark unknowns as unknown.
- Do not invent modules or dependencies.
- Update `.claude/STATE.md` under `Active System Map`.
```

Create `templates/claude/skills/checkpoint/SKILL.md`:

```markdown
---
name: checkpoint
description: Record Git deltas, current state, blockers, commands run, and next steps.
---

# Checkpoint

Primary goal: Record a factual audit trail.

## Steps

1. Inspect Git status.
2. Summarize changed files by purpose.
3. Record current state, blocker, commands run, and next step.
4. Append the entry to `.claude/STATE.md` under `Checkpoints`.

## Entry Format

```text
Date:
Working:
Current:
Blocker:
Git Delta:
Commands Run:
Next:
```

## Rules

- Keep entries short and factual.
- Say `none` when there is no blocker.
- Never claim tests passed unless output was observed.
```

Create `templates/claude/skills/gatekeeper/SKILL.md`:

```markdown
---
name: gatekeeper
description: Validate implementation against intent before reporting completion.
---

# Gatekeeper

Primary goal: Validate work before completion.

## Steps

1. Read the active intent model from `.claude/STATE.md` when present.
2. Identify relevant tests, linters, and type checks from project files.
3. Run available checks when safe.
4. Compare observed results against the intent model.
5. Report passing, failing, and unknown checks separately.
6. Append validation result to `.claude/STATE.md` under `Validation History`.

## Report Format

```text
Intent Model Checked:
Commands Run:
Passing:
Failing:
Unknown:
Regression Risk:
Final Decision:
```

## Rules

- Do not hide failing checks.
- Do not treat unknown checks as passing.
- Do not say done when required validation failed.
```

- [ ] **Step 6: Run tests to verify templates install**

Run:

```sh
sh tests/run-tests.sh
```

Expected: PASS for generic install, dry run, command links, and skill goals.

## Task 3: Implement Safe Copy, Force Mode, And Stack Detection

**Files:**
- Modify: `tests/run-tests.sh`
- Modify: `setupskill.sh`

- [ ] **Step 1: Add failing tests for overwrite protection, force, Node, and Python detection**

Append these tests before the final `printf` line in `tests/run-tests.sh` and call them before the final print:

```sh
test_existing_files_are_preserved_without_force() {
  project=$(make_project preserve-existing)
  mkdir -p "$project/.claude/commands"
  printf 'custom command\n' > "$project/.claude/commands/align-intent.md"

  run_installer --target "$project" >/tmp/moskills-test-output.txt

  assert_contains "$project/.claude/commands/align-intent.md" 'custom command'
  assert_contains /tmp/moskills-test-output.txt 'Skip existing file:'
  pass 'existing files are preserved without force'
}

test_force_overwrites_existing_files() {
  project=$(make_project force-existing)
  mkdir -p "$project/.claude/commands"
  printf 'custom command\n' > "$project/.claude/commands/align-intent.md"

  run_installer --target "$project" --force >/tmp/moskills-test-output.txt

  assert_contains "$project/.claude/commands/align-intent.md" 'Use skill: align-intent'
  pass 'force overwrites existing managed files'
}

test_node_project_detection() {
  project=$(make_project node-detect)
  printf '{"scripts":{"test":"echo ok"}}\n' > "$project/package.json"
  run_installer --target "$project" >/tmp/moskills-test-output.txt

  assert_contains /tmp/moskills-test-output.txt 'Detected stack: node'
  pass 'node project is detected'
}

test_python_project_detection() {
  project=$(make_project python-detect)
  printf '[project]\nname = "demo"\n' > "$project/pyproject.toml"
  run_installer --target "$project" >/tmp/moskills-test-output.txt

  assert_contains /tmp/moskills-test-output.txt 'Detected stack: python'
  pass 'python project is detected'
}
```

- [ ] **Step 2: Run tests to verify detection output is missing**

Run:

```sh
sh tests/run-tests.sh
```

Expected: FAIL on stack detection output.

- [ ] **Step 3: Add stack detection to installer**

In `setupskill.sh`, add this function before `install_tree`:

```sh
detect_stack() {
  if [ -f "$TARGET_DIR/package.json" ]; then
    printf 'node'
    return 0
  fi

  if [ -f "$TARGET_DIR/pyproject.toml" ] || [ -f "$TARGET_DIR/requirements.txt" ] || [ -f "$TARGET_DIR/setup.py" ]; then
    printf 'python'
    return 0
  fi

  printf 'generic'
}
```

Then after the dry-run log block, add:

```sh
STACK=$(detect_stack)
log "Detected stack: $STACK"
```

- [ ] **Step 4: Add test calls**

Add these calls before the final `printf` in `tests/run-tests.sh`:

```sh
test_existing_files_are_preserved_without_force
test_force_overwrites_existing_files
test_node_project_detection
test_python_project_detection
```

- [ ] **Step 5: Run tests**

Run:

```sh
sh tests/run-tests.sh
```

Expected: all current tests PASS.

## Task 4: Implement Optional Git Hooks And Guardrails

**Files:**
- Modify: `tests/run-tests.sh`
- Modify: `setupskill.sh`
- Create: `templates/claude/hooks/agent-guard.sh`
- Create: `templates/claude/hooks/pre-commit`

- [ ] **Step 1: Add failing hook tests**

Append these tests before the final `printf` line in `tests/run-tests.sh` and call them before the final print:

```sh
test_hooks_are_not_installed_by_default() {
  project=$(make_project hooks-default)
  git -C "$project" init >/dev/null 2>&1

  run_installer --target "$project" >/tmp/moskills-test-output.txt

  assert_not_exists "$project/.git/hooks/pre-commit"
  assert_file "$project/.claude/hooks/agent-guard.sh"
  pass 'git pre-commit hook is not installed by default'
}

test_hooks_install_with_flag() {
  project=$(make_project hooks-with-flag)
  git -C "$project" init >/dev/null 2>&1

  run_installer --target "$project" --with-hooks >/tmp/moskills-test-output.txt
  assert_file "$project/.git/hooks/pre-commit"
  assert_contains "$project/.git/hooks/pre-commit" 'agent-guard.sh'
  pass 'git pre-commit hook installs with flag'
}

test_existing_git_hook_is_preserved_without_force() {
  project=$(make_project hooks-preserve)
  git -C "$project" init >/dev/null 2>&1
  printf '# custom hook\n' > "$project/.git/hooks/pre-commit"

  run_installer --target "$project" --with-hooks >/tmp/moskills-test-output.txt
  assert_contains "$project/.git/hooks/pre-commit" '# custom hook'
  assert_contains /tmp/moskills-test-output.txt 'Skip existing Git hook:'
  pass 'existing git hook is preserved without force'
}
```

- [ ] **Step 2: Run tests to verify hook install fails**

Run:

```sh
sh tests/run-tests.sh
```

Expected: FAIL because hook files and hook install logic do not exist yet.

- [ ] **Step 3: Create guard script and pre-commit wrapper**

Create `templates/claude/hooks/agent-guard.sh`:

```sh
#!/usr/bin/env sh
set -eu

failures=0

say() {
  printf '%s\n' "$1"
}

mark_failure() {
  failures=$((failures + 1))
  say "agent-guard: $1"
}

staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$staged_files" ]; then
  say 'agent-guard: no staged files to check'
  exit 0
fi

for file in $staged_files; do
  [ -f "$file" ] || continue

  if grep -n '<<<<<<<\|=======\|>>>>>>>' "$file" >/dev/null 2>&1; then
    mark_failure "conflict marker found in $file"
  fi

  if grep -n 'TODO: implement later\|TBD\|fake test\|tests passed without running' "$file" >/dev/null 2>&1; then
    mark_failure "blocked placeholder phrase found in $file"
  fi
done

if [ -f package.json ]; then
  say 'agent-guard: detected Node project. Suggested validation: npm test'
fi

if [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ]; then
  say 'agent-guard: detected Python project. Suggested validation: pytest'
fi

if [ ! -f .claude/STATE.md ] || ! grep -F 'Date:' .claude/STATE.md >/dev/null 2>&1; then
  say 'agent-guard: warning: no checkpoint entry found in .claude/STATE.md'
fi

if [ "$failures" -gt 0 ]; then
  exit 1
fi
```

Create `templates/claude/hooks/pre-commit`:

```sh
#!/usr/bin/env sh
set -eu

if [ -x .claude/hooks/agent-guard.sh ]; then
  exec .claude/hooks/agent-guard.sh
fi

if [ -f .claude/hooks/agent-guard.sh ]; then
  exec sh .claude/hooks/agent-guard.sh
fi

printf '%s\n' 'agent-guard: .claude/hooks/agent-guard.sh not found' >&2
exit 1
```

- [ ] **Step 4: Add hook installation logic**

In `setupskill.sh`, add this function after `install_tree`:

```sh
install_git_hook() {
  [ "$WITH_HOOKS" -eq 1 ] || return 0

  if ! git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log 'Skip Git hook install: target is not a Git repository'
    return 0
  fi

  hook_dest="$TARGET_DIR/.git/hooks/pre-commit"
  hook_src="$TEMPLATE_DIR/hooks/pre-commit"

  if [ -e "$hook_dest" ] && [ "$FORCE" -ne 1 ]; then
    log "Skip existing Git hook: $hook_dest"
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would copy Git hook: $hook_src -> $hook_dest"
    return 0
  fi

  cp "$hook_src" "$hook_dest"
  chmod +x "$hook_dest"
}
```

Replace the temporary hook message block with:

```sh
install_git_hook
```

- [ ] **Step 5: Ensure copied hook scripts are executable**

After `install_tree` and before `install_git_hook`, add:

```sh
if [ "$DRY_RUN" -ne 1 ] && [ -f "$TARGET_DIR/.claude/hooks/agent-guard.sh" ]; then
  chmod +x "$TARGET_DIR/.claude/hooks/agent-guard.sh"
fi
```

- [ ] **Step 6: Run tests**

Run:

```sh
sh tests/run-tests.sh
```

Expected: all current tests PASS.

## Task 5: Add User Documentation

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `LICENSE`
- Create: `docs/lifecycle.md`
- Create: `docs/command-reference.md`
- Create: `docs/pain-points.md`
- Create: `docs/examples/node-project.md`
- Create: `docs/examples/python-project.md`

- [ ] **Step 1: Add documentation smoke tests**

Append this test before the final `printf` line in `tests/run-tests.sh` and call it before the final print:

```sh
test_documentation_exists() {
  assert_file "$ROOT_DIR/README.md"
  assert_file "$ROOT_DIR/docs/lifecycle.md"
  assert_file "$ROOT_DIR/docs/command-reference.md"
  assert_file "$ROOT_DIR/docs/pain-points.md"
  assert_file "$ROOT_DIR/docs/examples/node-project.md"
  assert_file "$ROOT_DIR/docs/examples/python-project.md"
  assert_contains "$ROOT_DIR/README.md" './setupskill.sh --target /path/to/project'
  assert_contains "$ROOT_DIR/docs/lifecycle.md" 'New Feature -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done'
  pass 'documentation exists'
}
```

- [ ] **Step 2: Run tests to verify docs are missing**

Run:

```sh
sh tests/run-tests.sh
```

Expected: FAIL because docs are missing.

- [ ] **Step 3: Create README**

Create `README.md`:

```markdown
# moskills

Portable agentic skill workflows for development projects.

`moskills` installs slash commands, reusable skills, guardrails, and persistent state templates into a target project. It helps agents align intent, map architecture, record progress, and validate work before completion.

## Install

From this repository:

```sh
./setupskill.sh --target /path/to/project
```

With optional Git hook guardrails:

```sh
./setupskill.sh --target /path/to/project --with-hooks
```

Preview without writing files:

```sh
./setupskill.sh --target /path/to/project --dry-run
```

Overwrite managed files:

```sh
./setupskill.sh --target /path/to/project --force
```

## Installed Commands

- `/align-intent`: agree on Input, Action, Output, Success, Non-goals, and Risks before coding.
- `/system-map`: show Zoom-Out or Zoom-In architecture relationships.
- `/checkpoint`: record Git delta, current state, blocker, commands run, and next step.
- `/gatekeeper`: validate work against the active intent model before saying done.

## Lifecycle

```text
New Feature -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done
```

## Installed Files

```text
.claude/
  CLAUDE.md
  STATE.md
  commands/
  skills/
  hooks/
```

## Uninstall

Remove the installed files from `.claude/`. If you installed the optional Git hook, remove `.git/hooks/pre-commit` only if it was created by this installer.
```

- [ ] **Step 4: Create supporting docs**

Create `docs/lifecycle.md`:

```markdown
# Lifecycle

```text
New Feature -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done
```

## 1. New Feature

Start with the user request. Do not code until intent is clear.

## 2. /align-intent

Create a logic model with Input, Action, Output, Success, Non-goals, and Risks.

## 3. /system-map

Use Zoom-Out for system relationships or Zoom-In for one module.

## 4. Coding Phase

Work inside the agreed boundary. Use `/checkpoint` after meaningful changes.

## 5. /gatekeeper

Run relevant checks and compare observed results to the active intent model.

## 6. Done

Only report completion after validation is observed or unknowns are clearly named.
```

Create `docs/command-reference.md`:

```markdown
# Command Reference

## /align-intent

Use before coding. Produces a logic model.

## /system-map

Use before changing architecture or multiple modules. Supports Zoom-Out and Zoom-In.

## /checkpoint

Use during work. Appends state to `.claude/STATE.md`.

## /gatekeeper

Use before completion. Reports passing, failing, and unknown checks.
```

Create `docs/pain-points.md`:

```markdown
# Pain Points

| Pain point | Command |
| --- | --- |
| Agent starts coding before agreement | `/align-intent` |
| Agent edits wrong layer | `/system-map` |
| Agent loses long-session context | `/checkpoint` |
| Agent says done without proof | `/gatekeeper` |
| User cannot audit changes | `/checkpoint` |
| Unknown checks are treated as passing | `/gatekeeper` |
```

Create `docs/examples/node-project.md`:

```markdown
# Node Project Example

```sh
./setupskill.sh --target /path/to/node-project
```

Detection output includes:

```text
Detected stack: node
```

If optional hooks are installed, guard output suggests:

```text
agent-guard: detected Node project. Suggested validation: npm test
```
```

Create `docs/examples/python-project.md`:

```markdown
# Python Project Example

```sh
./setupskill.sh --target /path/to/python-project
```

Detection output includes:

```text
Detected stack: python
```

If optional hooks are installed, guard output suggests:

```text
agent-guard: detected Python project. Suggested validation: pytest
```
```

- [ ] **Step 5: Add changelog and license files**

Create `CHANGELOG.md`:

```markdown
# Changelog

## 0.1.0

- Add shell installer for Claude command and skill templates.
- Add four workflows: align intent, system map, checkpoint, and gatekeeper.
- Add optional Git hook guardrails.
```

Create `LICENSE`:

```text
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Run tests**

Run:

```sh
sh tests/run-tests.sh
```

Expected: all current tests PASS.

## Task 6: Add Project Workflow Tracker

**Files:**
- Create: `tasks/todo.md`

- [ ] **Step 1: Create tracker file**

Create `tasks/todo.md`:

```markdown
# Project Todo

Implementation plan: `docs/superpowers/plans/2026-05-22-agentic-skill-plugin.md`

## Build Tasks

- [ ] Add test harness and installer contract.
- [ ] Add core templates for commands, skills, router, and state.
- [ ] Implement safe copy, force mode, and stack detection.
- [ ] Implement optional Git hooks and guardrails.
- [ ] Add user documentation.
- [ ] Run final verification.

## Review

No implementation review recorded yet.
```

- [ ] **Step 2: Run tests**

Run:

```sh
sh tests/run-tests.sh
```

Expected: all tests still PASS.

## Task 7: Final Verification

**Files:**
- Modify only files needed to fix verification failures from earlier tasks.

- [ ] **Step 1: Run full smoke tests**

Run:

```sh
sh tests/run-tests.sh
```

Expected: all tests PASS and output ends with `All tests passed:`.

- [ ] **Step 2: Run installer dry run manually**

Run:

```sh
./setupskill.sh --target . --dry-run
```

Expected: output includes `Dry run enabled`, `Detected stack: generic`, and installed command names. It writes no files because dry run is enabled.

- [ ] **Step 3: Inspect Git status**

Run:

```sh
git status --short
```

Expected: only planned repository files are shown as added or modified.

- [ ] **Step 4: Record review notes**

Update `tasks/todo.md` review section with:

```markdown
## Review

- Installer verified with shell smoke tests.
- Dry run verified manually.
- Optional hook behavior verified by tests.
- No dependencies were installed.
```

- [ ] **Step 5: Ask before committing**

Do not commit automatically. Ask the user whether they want one commit for the completed v1 scaffold.

## Self-Review

Spec coverage:

- Installer behavior: Tasks 1, 3, and 4.
- Commands and skills: Task 2.
- Hooks and guardrails: Task 4.
- Persistence with `STATE.md`: Task 2.
- Documentation: Task 5.
- Tests: Tasks 1 through 7.
- No forced dependencies: all tasks use shell and Markdown only.

Placeholder scan:

- No unresolved `TBD`, `TODO`, `implement later`, or vague implementation steps are required by this plan.
- Guardrail examples intentionally include blocked placeholder phrases only inside test and guard content.

Type and name consistency:

- Command names match skill folder names: `align-intent`, `system-map`, `checkpoint`, `gatekeeper`.
- Installer flags match the design: `--target`, `--force`, `--dry-run`, `--with-hooks`, `--help`.
- State file path is consistently `.claude/STATE.md`.