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

assert_heading_before() {
  file=$1
  first_heading=$2
  second_heading=$3
  awk -v first="$first_heading" -v second="$second_heading" '
    $0 == first { first_line = NR }
    $0 == second { second_line = NR }
    END { exit !(first_line > 0 && second_line > 0 && first_line < second_line) }
  ' "$file" || fail "expected '$first_heading' before '$second_heading' in $file"
}

make_project() {
  name=$1
  mkdir -p "$TMP_ROOT/$name"
  printf '%s\n' "$TMP_ROOT/$name"
}

run_installer() {
  sh "$ROOT_DIR/setupskill.sh" "$@"
}

run_moskills() {
  sh "$ROOT_DIR/moskills" "$@"
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

  assert_contains "$project/.claude/commands/align-intent.md" '`align-intent` skill'
  assert_contains "$project/.claude/commands/shared-language.md" '`shared-language` skill'
  assert_contains "$project/.claude/commands/system-map.md" '`system-map` skill'
  assert_contains "$project/.claude/commands/tdd.md" '`tdd` skill'
  assert_contains "$project/.claude/commands/diagnose.md" '`diagnose` skill'
  assert_contains "$project/.claude/commands/checkpoint.md" '`checkpoint` skill'
  assert_contains "$project/.claude/commands/gatekeeper.md" '`gatekeeper` skill'
  assert_contains "$project/.claude/commands/compress-input.md" '`compress-input` skill'
  assert_contains "$project/.claude/commands/memorize.md" '`memorize` skill'
  assert_contains "$project/.claude/commands/handoff.md" '`handoff` skill'
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

  assert_contains "$project/.claude/commands/align-intent.md" '`align-intent` skill'
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

test_init_installs_delegation_standard() {
  project=$(make_project delegation-init)

  run_moskills init --target "$project" >/dev/null

  assert_file "$project/.claude/standard/delegation.md"
  assert_contains "$project/.claude/standard/delegation.md" 'Tier 1 — Fable 5: The Orchestrator'
  assert_contains "$project/.claude/standard/delegation.md" 'The Findings & Decision Rule (Mandatory)'
  assert_contains "$project/CLAUDE.md" '@.claude/standard/base.md'
  assert_contains "$project/CLAUDE.md" '@.claude/standard/delegation.md'
  assert_contains "$project/CLAUDE.md" '@.claude/standard/session-protocol.md'
  pass 'init installs delegation standard and imports it'
}

test_sync_rewrites_marker_block_with_new_imports() {
  project=$(make_project delegation-sync)
  run_moskills init --target "$project" >/dev/null

  # simulate a project installed before delegation.md existed
  awk '!/delegation.md/' "$project/CLAUDE.md" >"$project/CLAUDE.md.tmp"
  mv "$project/CLAUDE.md.tmp" "$project/CLAUDE.md"
  assert_not_contains "$project/CLAUDE.md" '@.claude/standard/delegation.md'

  run_moskills sync --target "$project" >/dev/null

  assert_contains "$project/CLAUDE.md" '@.claude/standard/delegation.md'
  pass 'sync rewrites marker block with new imports'
}

test_init_adds_settings_local_to_gitignore() {
  project=$(make_project gitignore-init)
  git -C "$project" init >/dev/null 2>&1

  run_moskills init --target "$project" >"$TMP_ROOT/gitignore-init-output.txt"

  assert_file "$project/.gitignore"
  assert_contains "$project/.gitignore" '.claude/settings.local.json'

  run_moskills init --target "$project" >/dev/null
  count=$(grep -cxF '.claude/settings.local.json' "$project/.gitignore")
  [ "$count" = "1" ] || fail 'expected single .gitignore entry after re-init'
  pass 'init adds settings.local.json to .gitignore once'
}

test_init_preserves_existing_gitignore_content() {
  project=$(make_project gitignore-existing)
  git -C "$project" init >/dev/null 2>&1
  printf '%s' 'node_modules' >"$project/.gitignore"

  run_moskills init --target "$project" >/dev/null

  assert_contains "$project/.gitignore" 'node_modules'
  grep -qxF '.claude/settings.local.json' "$project/.gitignore" || fail 'expected settings.local.json on its own line'
  pass 'init preserves existing .gitignore content'
}

test_init_without_git_repo_skips_gitignore() {
  project=$(make_project gitignore-nogit)

  run_moskills init --target "$project" >/dev/null

  assert_not_exists "$project/.gitignore"
  pass 'init without git repo does not create .gitignore'
}

test_sync_adds_missing_gitignore_entry() {
  project=$(make_project gitignore-sync)
  git -C "$project" init >/dev/null 2>&1
  run_moskills init --target "$project" >/dev/null

  # simulate a project installed before the entry existed
  rm "$project/.gitignore"

  run_moskills sync --target "$project" >/dev/null

  assert_file "$project/.gitignore"
  grep -qxF '.claude/settings.local.json' "$project/.gitignore" || fail 'expected sync to add gitignore entry'
  pass 'sync adds missing gitignore entry'
}

test_moskills_init_with_hooks_installs_git_hook() {
  project=$(make_project cli-hooks-flag)
  git -C "$project" init >/dev/null 2>&1

  run_moskills init --target "$project" --with-hooks >/dev/null

  assert_file "$project/.git/hooks/pre-commit"
  assert_contains "$project/.git/hooks/pre-commit" 'agent-guard.sh'
  pass 'moskills init --with-hooks installs git pre-commit hook'
}

test_moskills_init_without_hooks_flag_skips_git_hook() {
  project=$(make_project cli-hooks-default)
  git -C "$project" init >/dev/null 2>&1

  run_moskills init --target "$project" >/dev/null

  assert_not_exists "$project/.git/hooks/pre-commit"
  pass 'moskills init without --with-hooks leaves git hooks alone'
}

test_moskills_init_with_hooks_preserves_existing_hook() {
  project=$(make_project cli-hooks-preserve)
  output_file="$TMP_ROOT/cli-hooks-preserve-output.txt"
  git -C "$project" init >/dev/null 2>&1
  printf '%s\n' '# custom hook' >"$project/.git/hooks/pre-commit"

  run_moskills init --target "$project" --with-hooks >"$output_file"

  assert_contains "$project/.git/hooks/pre-commit" '# custom hook'
  assert_contains "$output_file" 'Skip existing Git hook:'
  pass 'moskills init --with-hooks preserves existing hook'
}

set_project_version() { # $1 = project, $2 = version
  sed 's/"version": *"[^"]*"/"version": "'"$2"'"/' "$1/.moskills.json" > "$1/.moskills.json.tmp"
  mv "$1/.moskills.json.tmp" "$1/.moskills.json"
}

test_sync_restores_deleted_managed_file() {
  project=$(make_project sync-restore)
  run_moskills init --target "$project" >/dev/null
  rm "$project/.claude/skills/tdd/SKILL.md"
  run_moskills sync --target "$project" >/dev/null || fail 'sync must not abort when a managed file is missing'
  assert_file "$project/.claude/skills/tdd/SKILL.md"
  pass 'sync restores a deleted managed file'
}

test_notice_reports_outdated_project() {
  project=$(make_project notice-outdated)
  run_moskills init --target "$project" >/dev/null
  set_project_version "$project" 0.0.1
  output_file="$TMP_ROOT/notice-outdated.txt"

  run_moskills notice --target "$project" >"$output_file" || fail 'notice must exit 0'

  assert_contains "$output_file" '0.0.1'
  assert_contains "$output_file" 'run /moskills-sync'
  pass 'notice reports outdated project'
}

test_notice_reports_plugin_older_than_project() {
  project=$(make_project notice-newer)
  run_moskills init --target "$project" >/dev/null
  set_project_version "$project" 99.0.0
  output_file="$TMP_ROOT/notice-newer.txt"

  run_moskills notice --target "$project" >"$output_file" || fail 'notice must exit 0'

  assert_contains "$output_file" 'update the moskills plugin'
  pass 'notice reports plugin older than project'
}

test_notice_is_silent_when_current() {
  project=$(make_project notice-current)
  run_moskills init --target "$project" >/dev/null
  output=$(run_moskills notice --target "$project") || fail 'notice must exit 0'

  [ -z "$output" ] || fail "expected no output, got: $output"
  pass 'notice is silent when project is current'
}

test_notice_is_silent_without_moskills() {
  project=$(make_project notice-none)
  output=$(run_moskills notice --target "$project") || fail 'notice must exit 0'

  [ -z "$output" ] || fail "expected no output, got: $output"
  pass 'notice is silent in projects without moskills'
}

test_notice_hook_format_is_json() {
  project=$(make_project notice-hook)
  run_moskills init --target "$project" >/dev/null
  set_project_version "$project" 0.0.1
  output_file="$TMP_ROOT/notice-hook.json"

  run_moskills notice --target "$project" --hook >"$output_file" || fail 'notice must exit 0'

  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert 'moskills-sync' in d['systemMessage']; assert d['hookSpecificOutput']['hookEventName']=='SessionStart'" "$output_file" \
    || fail 'expected SessionStart hook JSON with systemMessage'
  pass 'notice --hook emits SessionStart JSON'
}

test_plugin_registers_session_start_notice() {
  hooks_file="$ROOT_DIR/hooks/hooks.json"
  assert_file "$hooks_file"
  assert_contains "$hooks_file" 'SessionStart'
  assert_contains "$hooks_file" 'notice'
  pass 'plugin registers SessionStart version notice'
}

test_version_files_are_consistent() {
  v=$(cat "$ROOT_DIR/VERSION")
  plugin_v=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT_DIR/.claude-plugin/plugin.json" | head -1)
  [ "$plugin_v" = "$v" ] || fail "plugin.json version $plugin_v != VERSION $v"
  mk_count=$(grep -c "\"version\": \"$v\"" "$ROOT_DIR/.claude-plugin/marketplace.json")
  [ "$mk_count" = "2" ] || fail "marketplace.json must pin version $v twice (metadata + plugin entry), found $mk_count"
  assert_contains "$ROOT_DIR/CHANGELOG.md" "## $v"
  pass 'VERSION, plugin.json, marketplace.json, CHANGELOG are consistent'
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
  assert_heading_before "$ROOT_DIR/README.md" '## Installed Commands' '## Install'
  assert_not_contains "$ROOT_DIR/README.md" 'tasks/todo.md'
  assert_contains "$ROOT_DIR/.gitignore" 'tasks/'
  assert_contains "$ROOT_DIR/.gitignore" 'docs/superpowers/'
  assert_contains "$ROOT_DIR/CHANGELOG.md" '/shared-language'
  assert_contains "$ROOT_DIR/docs/lifecycle.md" 'New Feature -> /preview -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done'
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
test_init_installs_delegation_standard
test_sync_rewrites_marker_block_with_new_imports
test_init_adds_settings_local_to_gitignore
test_init_preserves_existing_gitignore_content
test_init_without_git_repo_skips_gitignore
test_sync_adds_missing_gitignore_entry
test_moskills_init_with_hooks_installs_git_hook
test_moskills_init_without_hooks_flag_skips_git_hook
test_moskills_init_with_hooks_preserves_existing_hook
test_sync_restores_deleted_managed_file
test_notice_reports_outdated_project
test_notice_reports_plugin_older_than_project
test_notice_is_silent_when_current
test_notice_is_silent_without_moskills
test_notice_hook_format_is_json
test_plugin_registers_session_start_notice
test_version_files_are_consistent
test_documentation_exists

printf 'All tests passed: %s\n' "$pass_count"