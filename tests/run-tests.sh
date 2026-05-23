#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP_ROOT="${TMPDIR:-/tmp}/moskills-tests-$$"

pass_count=0

cleanup() {
  rm -rf "$TMP_ROOT"
}

interrupt() {
  signal=$1
  cleanup
  trap - EXIT INT TERM

  case "$signal" in
    INT)
      exit 130
      ;;
    TERM)
      exit 143
      ;;
  esac

  exit 1
}

trap cleanup EXIT
trap 'interrupt INT' INT
trap 'interrupt TERM' TERM

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

assert_not_contains() {
  file=$1
  text=$2
  ! grep -F "$text" "$file" >/dev/null 2>&1 || fail "expected '$text' to be absent from $file"
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
  output_file="$TMP_ROOT/generic-install-output.txt"
  run_installer --target "$project" >"$output_file"

  assert_file "$project/.claude/CLAUDE.md"
  assert_file "$project/.claude/STATE.md"
  assert_file "$project/.claude/commands/align-intent.md"
  assert_file "$project/.claude/commands/shared-language.md"
  assert_file "$project/.claude/commands/system-map.md"
  assert_file "$project/.claude/commands/tdd.md"
  assert_file "$project/.claude/commands/diagnose.md"
  assert_file "$project/.claude/commands/checkpoint.md"
  assert_file "$project/.claude/commands/gatekeeper.md"
  assert_file "$project/.claude/commands/compress-input.md"
  assert_file "$project/.claude/commands/memorize.md"
  assert_file "$project/.claude/commands/handoff.md"
  assert_not_exists "$project/.claude/commands/caveman.md"
  assert_not_exists "$project/.claude/commands/claude-mem.md"
  assert_not_exists "$project/.claude/skills/caveman"
  assert_not_exists "$project/.claude/skills/claude-mem"
  assert_file "$project/.claude/skills/align-intent/SKILL.md"
  assert_file "$project/.claude/skills/shared-language/SKILL.md"
  assert_contains "$output_file" 'Installed commands:'
  pass 'generic install creates .claude files'
}

test_dry_run_writes_nothing() {
  project=$(make_project dry-run)
  output_file="$TMP_ROOT/dry-run-output.txt"
  run_installer --target "$project" --dry-run >"$output_file"

  assert_not_exists "$project/.claude"
  assert_contains "$output_file" 'Dry run enabled'
  assert_contains "$output_file" 'Would create directory'
  assert_contains "$output_file" 'Would install commands:'
  pass 'dry run writes nothing'
}

test_commands_point_to_matching_skills() {
  project=$(make_project command-links)
  output_file="$TMP_ROOT/command-links-output.txt"
  run_installer --target "$project" >"$output_file"

  assert_contains "$project/.claude/commands/align-intent.md" 'Use skill: align-intent'
  assert_contains "$project/.claude/commands/shared-language.md" 'Use skill: shared-language'
  assert_contains "$project/.claude/commands/system-map.md" 'Use skill: system-map'
  assert_contains "$project/.claude/commands/tdd.md" 'Use skill: tdd'
  assert_contains "$project/.claude/commands/diagnose.md" 'Use skill: diagnose'
  assert_contains "$project/.claude/commands/checkpoint.md" 'Use skill: checkpoint'
  assert_contains "$project/.claude/commands/gatekeeper.md" 'Use skill: gatekeeper'
  assert_contains "$project/.claude/commands/compress-input.md" 'Use skill: compress-input'
  assert_contains "$project/.claude/commands/memorize.md" 'Use skill: memorize'
  assert_contains "$project/.claude/commands/handoff.md" 'Use skill: handoff'
  pass 'commands point to matching skills'
}

test_skills_have_single_primary_goal() {
  project=$(make_project skill-goals)
  output_file="$TMP_ROOT/skill-goals-output.txt"
  run_installer --target "$project" >"$output_file"

  assert_contains "$project/.claude/skills/align-intent/SKILL.md" 'Primary goal: Ensure agreement before coding.'
  assert_contains "$project/.claude/skills/shared-language/SKILL.md" 'Primary goal: Build shared language for the project.'
  assert_contains "$project/.claude/skills/system-map/SKILL.md" 'Primary goal: Show module relationships before changes.'
  assert_contains "$project/.claude/skills/tdd/SKILL.md" 'Primary goal: Create a fast red-green-refactor feedback loop.'
  assert_contains "$project/.claude/skills/diagnose/SKILL.md" 'Primary goal: Find root cause before fixing.'
  assert_contains "$project/.claude/skills/checkpoint/SKILL.md" 'Primary goal: Record a factual audit trail.'
  assert_contains "$project/.claude/skills/gatekeeper/SKILL.md" 'Primary goal: Validate work before completion.'
  assert_contains "$project/.claude/skills/compress-input/SKILL.md" 'Primary goal: Keep agent communication short and direct.'
  assert_contains "$project/.claude/skills/compress-input/SKILL.md" 'Inspired by `JuliusBrussee/caveman`.'
  assert_contains "$project/.claude/skills/compress-input/SKILL.md" 'lite, full, ultra, wenyan'
  assert_contains "$project/.claude/skills/compress-input/SKILL.md" 'Output tokens only. Reasoning stays intact.'
  assert_contains "$project/.claude/skills/compress-input/SKILL.md" 'compress-file <file>'
  assert_contains "$project/.claude/skills/memorize/SKILL.md" 'Primary goal: Use durable memory without polluting the chat.'
  assert_contains "$project/.claude/skills/memorize/SKILL.md" 'Inspired by `thedotmack/claude-mem`.'
  assert_contains "$project/.claude/skills/memorize/SKILL.md" '3-Layer Workflow'
  assert_contains "$project/.claude/skills/memorize/SKILL.md" 'search -> timeline -> get_observations'
  assert_contains "$project/.claude/skills/handoff/SKILL.md" 'Primary goal: Compact current work into a handoff document.'
  pass 'skills have single primary goals'
}

test_existing_files_are_preserved_without_force() {
  project=$(make_project preserve-existing)
  output_file="$TMP_ROOT/preserve-existing-output.txt"
  mkdir -p "$project/.claude/commands"
  printf '%s\n' 'custom command' >"$project/.claude/commands/align-intent.md"

  run_installer --target "$project" >"$output_file"

  assert_contains "$project/.claude/commands/align-intent.md" 'custom command'
  assert_contains "$output_file" 'Skip existing file:'
  pass 'existing files are preserved without force'
}

test_force_overwrites_existing_files() {
  project=$(make_project force-overwrite)
  output_file="$TMP_ROOT/force-overwrite-output.txt"
  mkdir -p "$project/.claude/commands"
  printf '%s\n' 'custom command' >"$project/.claude/commands/align-intent.md"

  run_installer --target "$project" --force >"$output_file"

  assert_contains "$project/.claude/commands/align-intent.md" 'Use skill: align-intent'
  pass 'force overwrites existing managed files'
}

test_node_project_detection() {
  project=$(make_project node-project)
  output_file="$TMP_ROOT/node-project-output.txt"
  printf '%s\n' '{"scripts":{}}' >"$project/package.json"

  run_installer --target "$project" >"$output_file"

  assert_contains "$output_file" 'Detected stack: node'
  pass 'node project is detected'
}

test_python_project_detection() {
  project=$(make_project python-project)
  output_file="$TMP_ROOT/python-project-output.txt"
  printf '%s\n' '[project]' >"$project/pyproject.toml"

  run_installer --target "$project" >"$output_file"

  assert_contains "$output_file" 'Detected stack: python'
  pass 'python project is detected'
}

test_hooks_are_not_installed_by_default() {
  project=$(make_project hooks-default)
  output_file="$TMP_ROOT/hooks-default-output.txt"
  git -C "$project" init >/dev/null 2>&1

  run_installer --target "$project" >"$output_file"

  assert_not_exists "$project/.git/hooks/pre-commit"
  assert_file "$project/.claude/hooks/agent-guard.sh"
  pass 'git pre-commit hook is not installed by default'
}

test_hooks_install_with_flag() {
  project=$(make_project hooks-with-flag)
  output_file="$TMP_ROOT/hooks-with-flag-output.txt"
  git -C "$project" init >/dev/null 2>&1

  run_installer --target "$project" --with-hooks >"$output_file"

  assert_file "$project/.git/hooks/pre-commit"
  assert_contains "$project/.git/hooks/pre-commit" 'agent-guard.sh'
  pass 'git pre-commit hook installs with flag'
}

test_existing_git_hook_is_preserved_without_force() {
  project=$(make_project hooks-preserve-existing)
  output_file="$TMP_ROOT/hooks-preserve-existing-output.txt"
  git -C "$project" init >/dev/null 2>&1
  printf '%s\n' '# custom hook' >"$project/.git/hooks/pre-commit"

  run_installer --target "$project" --with-hooks >"$output_file"

  assert_contains "$project/.git/hooks/pre-commit" '# custom hook'
  assert_contains "$output_file" 'Skip existing Git hook:'
  pass 'existing git hook is preserved without force'
}

test_agent_guard_checks_staged_content_not_worktree() {
  project=$(make_project staged-guard)
  safe_output="$TMP_ROOT/staged-guard-safe-output.txt"
  blocked_output="$TMP_ROOT/staged-guard-blocked-output.txt"
  git -C "$project" init >/dev/null 2>&1
  git -C "$project" config user.email tests@example.invalid
  git -C "$project" config user.name Tests

  run_installer --target "$project" >"$TMP_ROOT/staged-guard-install-output.txt"

  printf '%s\n' 'ready for review' >"$project/example.txt"
  git -C "$project" add example.txt
  printf '%s\n' 'TODO: implement later' >"$project/example.txt"

  (cd "$project" && sh .claude/hooks/agent-guard.sh) >"$safe_output" 2>&1 || fail 'expected staged-safe guard run to pass'

  printf '%s\n' 'TODO: implement later' >"$project/example.txt"
  git -C "$project" add example.txt
  printf '%s\n' 'ready for review' >"$project/example.txt"

  if (cd "$project" && sh .claude/hooks/agent-guard.sh) >"$blocked_output" 2>&1; then
    fail 'expected staged-bad guard run to fail'
  fi

  assert_contains "$blocked_output" 'blocked placeholder phrase found'
  pass 'agent guard checks staged content'
}

test_agent_guard_allows_markdown_setext_heading() {
  project=$(make_project markdown-setext-heading)
  output_file="$TMP_ROOT/markdown-setext-heading-output.txt"
  git -C "$project" init >/dev/null 2>&1

  run_installer --target "$project" >"$TMP_ROOT/markdown-setext-heading-install-output.txt"

  printf '%s\n' 'Heading' '=======' '' 'Body copy.' >"$project/README.md"
  git -C "$project" add README.md

  (cd "$project" && sh .claude/hooks/agent-guard.sh) >"$output_file" 2>&1 || fail 'expected markdown Setext heading guard run to pass'

  pass 'agent guard allows markdown setext heading'
}

test_hook_install_supports_gitdir_file() {
  project=$(make_project gitdir-file-hooks)
  output_file="$TMP_ROOT/gitdir-file-hooks-output.txt"
  git_dir="$project/.moved-git"
  git -C "$project" init >/dev/null 2>&1
  mv "$project/.git" "$git_dir"
  printf 'gitdir: %s\n' "$git_dir" >"$project/.git"

  git -C "$project" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'expected gitdir file repository to be detected by git'

  run_installer --target "$project" --with-hooks >"$output_file"

  hook_path=$(git -C "$project" rev-parse --git-path hooks/pre-commit)
  assert_file "$hook_path"
  assert_contains "$hook_path" 'agent-guard.sh'
  pass 'gitdir file hook install is supported'
}

test_documentation_exists() {
  assert_file "$ROOT_DIR/README.md"
  assert_file "$ROOT_DIR/.gitignore"
  assert_file "$ROOT_DIR/CHANGELOG.md"
  assert_file "$ROOT_DIR/LICENSE"
  assert_file "$ROOT_DIR/docs/lifecycle.md"
  assert_file "$ROOT_DIR/docs/command-reference.md"
  assert_file "$ROOT_DIR/docs/pain-points.md"
  assert_file "$ROOT_DIR/docs/examples/node-project.md"
  assert_file "$ROOT_DIR/docs/examples/python-project.md"

  assert_contains "$ROOT_DIR/README.md" './setupskill.sh --target /path/to/project'
  assert_contains "$ROOT_DIR/README.md" 'fruit of learning from engineers, experts, and successful GitHub repos'
  assert_contains "$ROOT_DIR/README.md" 'What users get'
  assert_not_contains "$ROOT_DIR/README.md" 'tasks/todo.md'
  assert_contains "$ROOT_DIR/.gitignore" 'tasks/'
  assert_contains "$ROOT_DIR/.gitignore" 'docs/superpowers/'
  assert_contains "$ROOT_DIR/CHANGELOG.md" '/shared-language'
  assert_contains "$ROOT_DIR/docs/lifecycle.md" 'New Feature -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done'
  assert_contains "$ROOT_DIR/docs/command-reference.md" '/shared-language'
  assert_contains "$ROOT_DIR/docs/command-reference.md" 'lite, full, ultra, wenyan'
  assert_contains "$ROOT_DIR/docs/command-reference.md" 'search -> timeline -> get_observations'
  assert_contains "$ROOT_DIR/docs/command-reference.md" '/compress-input'
  assert_contains "$ROOT_DIR/docs/command-reference.md" '/memorize'
  assert_contains "$ROOT_DIR/docs/pain-points.md" 'Requirements live in scattered chat messages, so agent starts coding from an incomplete brief.'
  assert_contains "$ROOT_DIR/docs/pain-points.md" '| `/memorize` | A lesson, user preference, or project decision keeps getting rediscovered instead of reused. | Store the short durable fact in memory, then point current work back to `.claude/STATE.md` when needed. |'
  assert_contains "$ROOT_DIR/templates/claude/STATE.md" 'Local working state for the current project.'
  assert_contains "$ROOT_DIR/templates/claude/skills/memorize/SKILL.md" 'Use `.claude/STATE.md` for current project working state.'
  assert_contains "$ROOT_DIR/templates/claude/CLAUDE.md" 'Do not push directly to the default branch. Push a branch and open a pull request.'
  assert_contains "$ROOT_DIR/README.md" 'Do not push directly to the default branch. Push a branch and open a pull request.'
  pass 'documentation exists'
}

mkdir -p "$TMP_ROOT"
test_generic_install_creates_claude_files
test_dry_run_writes_nothing
test_commands_point_to_matching_skills
test_skills_have_single_primary_goal
test_existing_files_are_preserved_without_force
test_force_overwrites_existing_files
test_node_project_detection
test_python_project_detection
test_hooks_are_not_installed_by_default
test_hooks_install_with_flag
test_existing_git_hook_is_preserved_without_force
test_agent_guard_checks_staged_content_not_worktree
test_agent_guard_allows_markdown_setext_heading
test_hook_install_supports_gitdir_file
test_documentation_exists

printf 'All tests passed: %s\n' "$pass_count"