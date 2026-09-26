#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP_ROOT="${TMPDIR:-/tmp}/moskills-tests-$$"

pass_count=0

# never touch a real Claude Code install: tests that need it point this at a stub
MOSKILLS_CLAUDE=/nonexistent/claude
export MOSKILLS_CLAUDE
# evolvebooks resolve their home from HOME and XDG_CONFIG_HOME only
unset EVOLVEBOOKS_HOME XDG_CONFIG_HOME

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
  grep -F -e "$text" "$file" >/dev/null 2>&1 || fail "expected '$text' in $file"
}

assert_not_contains() {
  file=$1
  text=$2
  ! grep -F -e "$text" "$file" >/dev/null 2>&1 || fail "expected '$text' to be absent from $file"
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

make_home() { # $1 = name; fake HOME with antigravity + codex dirs
  h="$TMP_ROOT/home-$1"
  mkdir -p "$h/.gemini/config/skills" "$h/.agents/skills"
  printf '%s\n' "$h"
}

test_link_symlinks_skills_into_detected_agents() {
  h=$(make_home link)
  HOME=$h run_moskills link >/dev/null
  [ -L "$h/.gemini/config/skills/tdd" ] || fail 'expected antigravity tdd symlink'
  [ -L "$h/.agents/skills/learn" ] || fail 'expected codex learn symlink'
  [ "$(readlink "$h/.gemini/config/skills/tdd")" = "$ROOT_DIR/templates/claude/skills/tdd" ] || fail 'wrong symlink target'
  pass 'link symlinks skills into detected agents'
}

test_link_skips_agents_that_are_not_installed() {
  h="$TMP_ROOT/home-noagents"; mkdir -p "$h"
  HOME=$h run_moskills link >/dev/null
  assert_not_exists "$h/.gemini"
  assert_not_exists "$h/.agents"
  pass 'link skips agents that are not installed'
}

test_link_is_idempotent_and_retargets_stale_links() {
  h=$(make_home relink)
  ln -s /nonexistent/old "$h/.gemini/config/skills/tdd"
  HOME=$h run_moskills link >/dev/null
  HOME=$h run_moskills link >/dev/null
  [ "$(readlink "$h/.gemini/config/skills/tdd")" = "$ROOT_DIR/templates/claude/skills/tdd" ] || fail 'expected stale link retargeted'
  pass 'link is idempotent and retargets stale links'
}

test_link_keeps_real_folders_without_replace() {
  h=$(make_home keep)
  mkdir -p "$h/.gemini/config/skills/tdd"; printf 'old\n' > "$h/.gemini/config/skills/tdd/SKILL.md"
  out="$TMP_ROOT/link-keep.txt"
  HOME=$h run_moskills link >"$out"
  [ ! -L "$h/.gemini/config/skills/tdd" ] || fail 'real folder must not be replaced'
  assert_contains "$out" 'rerun with --replace'
  pass 'link keeps real folders without --replace'
}

test_link_replace_backs_up_real_folders() {
  h=$(make_home replace)
  mkdir -p "$h/.gemini/config/skills/tdd"; printf 'old\n' > "$h/.gemini/config/skills/tdd/SKILL.md"
  HOME=$h run_moskills link --replace >/dev/null
  [ -L "$h/.gemini/config/skills/tdd" ] || fail 'expected symlink after --replace'
  ls "$h"/.moskills-backups/antigravity/tdd-*/SKILL.md >/dev/null 2>&1 || fail 'expected backup of old folder'
  pass 'link --replace backs up real folders'
}

test_link_installs_working_launcher() {
  h=$(make_home launcher)
  HOME=$h run_moskills link >/dev/null
  [ -L "$h/.local/bin/moskills" ] || fail 'expected launcher symlink'
  [ "$(sh "$h/.local/bin/moskills" version)" = "$(cat "$ROOT_DIR/VERSION")" ] || fail 'launcher must resolve its install dir'
  pass 'link installs a working launcher'
}

test_unlink_removes_only_moskills_links() {
  h=$(make_home unlink)
  mkdir -p "$h/.agents/skills/mine"
  ln -s /somewhere/else "$h/.agents/skills/foreign"
  HOME=$h run_moskills link >/dev/null
  HOME=$h run_moskills unlink >/dev/null
  assert_not_exists "$h/.gemini/config/skills/tdd"
  assert_not_exists "$h/.local/bin/moskills"
  [ -d "$h/.agents/skills/mine" ] || fail 'real folder must survive unlink'
  [ -L "$h/.agents/skills/foreign" ] || fail 'foreign symlink must survive unlink'
  pass 'unlink removes only moskills links'
}

test_init_agents_installs_project_skills_and_agents_md() {
  project=$(make_project init-agents)
  printf '# My rules\n' > "$project/AGENTS.md"
  run_moskills init --target "$project" --agents >/dev/null
  assert_file "$project/.agents/skills/tdd/SKILL.md"
  assert_contains "$project/AGENTS.md" '# My rules'
  assert_contains "$project/AGENTS.md" 'moskills:begin'
  assert_contains "$project/AGENTS.md" '.claude/standard/base.md'
  assert_contains "$project/.moskills.json" '"agents": true'
  pass 'init --agents installs project skills and AGENTS.md block'
}

test_init_without_agents_skips_agent_files() {
  project=$(make_project init-noagents)
  run_moskills init --target "$project" >/dev/null
  assert_not_exists "$project/.agents"
  assert_not_exists "$project/AGENTS.md"
  pass 'init without --agents skips agent files'
}

test_sync_maintains_agent_files() {
  project=$(make_project sync-agents)
  run_moskills init --target "$project" --agents >/dev/null
  rm -rf "$project/.agents/skills/tdd"
  run_moskills sync --target "$project" >/dev/null
  assert_file "$project/.agents/skills/tdd/SKILL.md"
  assert_contains "$project/.moskills.json" '"agents": true'
  pass 'sync maintains agent files'
}

test_doctor_flags_missing_agents_block() {
  project=$(make_project doctor-agents)
  run_moskills init --target "$project" --agents >/dev/null
  printf '# wiped\n' > "$project/AGENTS.md"
  out="$TMP_ROOT/doctor-agents.txt"
  run_moskills doctor --target "$project" >"$out" && fail 'doctor must fail when AGENTS.md block is missing'
  assert_contains "$out" 'AGENTS.md missing managed block'
  pass 'doctor flags missing AGENTS.md block'
}

test_self_update_refuses_outside_git_checkout() {
  copy="$TMP_ROOT/nogit-install"; mkdir -p "$copy"
  cp -R "$ROOT_DIR/moskills" "$ROOT_DIR/VERSION" "$ROOT_DIR/templates" "$copy/"
  out="$TMP_ROOT/self-update.txt"
  sh "$copy/moskills" self-update >"$out" 2>&1 && fail 'self-update must fail outside a git checkout'
  assert_contains "$out" 'not a git checkout'
  pass 'self-update refuses outside a git checkout'
}

test_schedule_update_writes_launch_agent() {
  h=$(make_home schedule)
  HOME=$h MOSKILLS_NO_LAUNCHCTL=1 run_moskills schedule-update >/dev/null
  plist="$h/Library/LaunchAgents/com.moskills.self-update.plist"
  assert_file "$plist"
  assert_contains "$plist" 'self-update'
  assert_contains "$plist" "$ROOT_DIR/moskills"
  pass 'schedule-update writes a LaunchAgent'
}

run_install() { # $1 = fake HOME, $2 = install dir; installs from this working tree without network
  HOME=$1 MOSKILLS_HOME=$2 MOSKILLS_REPO=$ROOT_DIR MOSKILLS_YES=1 MOSKILLS_NO_LAUNCHCTL=1 sh "$ROOT_DIR/install.sh"
}

test_install_script_installs_standalone_copy() {
  h=$(make_home install)
  dest="$h/.moskills"
  out="$TMP_ROOT/install.txt"
  run_install "$h" "$dest" >"$out" 2>&1 || fail 'install.sh must succeed'
  assert_file "$dest/moskills"
  assert_file "$dest/VERSION"
  assert_file "$dest/.moskills-standalone"
  assert_not_exists "$dest/.git"
  [ -L "$h/.gemini/config/skills/tdd" ] || fail 'install must run setup and link agents'
  [ "$(readlink "$h/.gemini/config/skills/tdd")" = "$(cd "$dest" && pwd)/templates/claude/skills/tdd" ] || fail 'links must point at the standalone copy'
  assert_contains "$out" 'moskills init --agents'
  pass 'install.sh installs a standalone copy and runs setup'
}

test_install_script_is_rerunnable() {
  h=$(make_home reinstall)
  dest="$h/.moskills"
  run_install "$h" "$dest" >/dev/null 2>&1
  run_install "$h" "$dest" >/dev/null 2>&1 || fail 'second install must succeed'
  assert_file "$dest/moskills"
  pass 'install.sh can be run again safely'
}

test_setup_yes_links_backs_up_and_schedules() {
  h=$(make_home setup)
  mkdir -p "$h/.gemini/config/skills/tdd"; printf 'old\n' > "$h/.gemini/config/skills/tdd/SKILL.md"
  out="$TMP_ROOT/setup.txt"
  HOME=$h MOSKILLS_NO_LAUNCHCTL=1 run_moskills setup --yes >"$out"
  [ -L "$h/.gemini/config/skills/tdd" ] || fail 'setup --yes must replace old copies'
  ls "$h"/.moskills-backups/antigravity/tdd-*/SKILL.md >/dev/null 2>&1 || fail 'expected backup'
  if [ "$(uname)" = Darwin ]; then
    assert_file "$h/Library/LaunchAgents/com.moskills.self-update.plist"
  else
    assert_contains "$out" 'crontab -e'
  fi
  assert_contains "$out" 'moskills init --agents'
  assert_file "$h/.evolvebooks/EVOLVEBOOKS.md"
  assert_contains "$out" '/evolvebook new'
  pass 'setup --yes links, backs up, sets up evolvebooks and schedules updates'
}

test_setup_answers_no_changes_nothing() {
  h=$(make_home setup-no)
  answers="$TMP_ROOT/answers-no.txt"; printf 'n\nn\nn\nn\nn\n' > "$answers"
  HOME=$h MOSKILLS_TTY=$answers MOSKILLS_NO_LAUNCHCTL=1 run_moskills setup >/dev/null
  assert_not_exists "$h/.gemini/config/skills/tdd"
  assert_not_exists "$h/.evolvebooks"
  assert_not_exists "$h/Library/LaunchAgents/com.moskills.self-update.plist"
  pass 'setup respects no answers'
}

test_status_reports_links_and_updates() {
  h=$(make_home status)
  HOME=$h run_moskills link >/dev/null
  out="$TMP_ROOT/status.txt"
  HOME=$h run_moskills status >"$out" || fail 'status must exit 0'
  count=$(ls "$ROOT_DIR/templates/claude/skills" | wc -l | tr -d ' ')
  assert_contains "$out" "antigravity: $count skills linked"
  assert_contains "$out" 'Daily update: off'
  assert_contains "$out" "Version: $(cat "$ROOT_DIR/VERSION")"
  pass 'status reports version, links and updates'
}

test_uninstall_removes_standalone_install() {
  h=$(make_home uninstall)
  dest="$h/.moskills"
  run_install "$h" "$dest" >/dev/null 2>&1
  HOME=$h MOSKILLS_NO_LAUNCHCTL=1 sh "$dest/moskills" uninstall --yes >/dev/null || fail 'uninstall must succeed'
  assert_not_exists "$dest"
  assert_not_exists "$h/.gemini/config/skills/tdd"
  assert_not_exists "$h/.local/bin/moskills"
  assert_not_exists "$h/Library/LaunchAgents/com.moskills.self-update.plist"
  pass 'uninstall removes a standalone install completely'
}

test_uninstall_keeps_development_clone() {
  h=$(make_home uninstall-dev)
  HOME=$h run_moskills link >/dev/null
  out="$TMP_ROOT/uninstall-dev.txt"
  HOME=$h MOSKILLS_NO_LAUNCHCTL=1 run_moskills uninstall --yes >"$out"
  assert_file "$ROOT_DIR/moskills"
  assert_not_exists "$h/.gemini/config/skills/tdd"
  assert_contains "$out" 'kept'
  pass 'uninstall never deletes a development clone'
}

test_init_suggests_agents_when_agents_md_exists() {
  project=$(make_project init-tip)
  printf '# rules\n' > "$project/AGENTS.md"
  out="$TMP_ROOT/init-tip.txt"
  run_moskills init --target "$project" >"$out"
  assert_contains "$out" 'moskills sync --agents'
  assert_not_exists "$project/.agents"
  pass 'init suggests --agents when AGENTS.md exists'
}

test_first_commit_after_init_with_hooks_passes() {
  project=$(make_project first-commit)
  git -C "$project" init >/dev/null 2>&1
  git -C "$project" config user.email tests@example.invalid
  git -C "$project" config user.name Tests
  run_moskills init --target "$project" --with-hooks --agents >/dev/null
  git -C "$project" add -A
  git -C "$project" commit -qm init >"$TMP_ROOT/first-commit.txt" 2>&1 || fail 'first commit after init must pass the guard'
  pass 'first commit after init --with-hooks passes the guard'
}

test_guard_still_blocks_placeholders_in_project_files() {
  project=$(make_project guard-still-blocks)
  git -C "$project" init >/dev/null 2>&1
  run_moskills init --target "$project" >/dev/null
  printf '%s\n' 'TODO: implement later' > "$project/app.txt"
  git -C "$project" add -A
  (cd "$project" && sh .claude/hooks/agent-guard.sh) >"$TMP_ROOT/guard-blocks.txt" 2>&1 && fail 'placeholder in a project file must still be blocked'
  assert_contains "$TMP_ROOT/guard-blocks.txt" 'app.txt'
  assert_not_contains "$TMP_ROOT/guard-blocks.txt" 'agent-guard.sh'
  pass 'guard still blocks placeholders in project files'
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
  assert_contains "$ROOT_DIR/README.md" 'curl -fsSL https://raw.githubusercontent.com/Mouad1/moskills/main/install.sh | sh'
  assert_contains "$ROOT_DIR/docs/command-reference.md" 'moskills setup'
  assert_contains "$ROOT_DIR/docs/command-reference.md" 'moskills uninstall'
  assert_contains "$ROOT_DIR/docs/pain-points.md" 'Requirements live in scattered chat messages, so agent starts coding from an incomplete brief.'
  assert_contains "$ROOT_DIR/docs/pain-points.md" '| `/memorize` | A lesson, user preference, or project decision keeps getting rediscovered instead of reused. | Store the short durable fact in memory, then point current work back to `.claude/STATE.md` when needed. |'
  assert_contains "$ROOT_DIR/templates/claude/STATE.md" 'Local working state for the current project.'
  assert_contains "$ROOT_DIR/templates/claude/skills/memorize/SKILL.md" 'Use `.claude/STATE.md` for current project working state.'
  assert_contains "$ROOT_DIR/templates/claude/CLAUDE.md" 'Do not push directly to the default branch. Push a branch and open a pull request.'
  assert_contains "$ROOT_DIR/README.md" 'Do not push directly to the default branch. Push a branch and open a pull request.'
  pass 'documentation exists'
}

# ---------- evolvebooks ----------
EB_SCRIPT="$ROOT_DIR/templates/claude/skills/evolvebook/scripts/evolvebook.sh"

eb_home() { # $1 = name -> fresh fake HOME
  h="$TMP_ROOT/ebhome-$1"
  mkdir -p "$h"
  printf '%s\n' "$h"
}

eb() { # runs the helper with HOME=$EBH from directory $EBD (default: TMP_ROOT)
  (cd "${EBD:-$TMP_ROOT}" && HOME=$EBH sh "$EB_SCRIPT" "$@")
}

eb_book() { # $1 = name; configured default home with one book
  EBH=$(eb_home "$1")
  eb setup --default >/dev/null
  eb new article --purpose 'Dev articles' --use-when 'writing a dev article' --choices 'topic, format, hook, length' >/dev/null
  BOOK="$EBH/.evolvebooks/article"
}

test_evolvebook_skill_is_registered_and_valid() {
  assert_contains "$ROOT_DIR/.claude-plugin/plugin.json" './templates/claude/skills/evolvebook'
  sk="$ROOT_DIR/templates/claude/skills/evolvebook/SKILL.md"
  [ "$(sed -n 1p "$sk")" = '---' ] || fail 'SKILL.md must start with frontmatter'
  sed -n '2,4p' "$sk" | grep -qx 'name: evolvebook' || fail 'frontmatter name must be evolvebook'
  sed -n '2,4p' "$sk" | grep -q '^description: "Use when: ' || fail 'frontmatter description must start with Use when:'
  assert_contains "$sk" 'Primary goal: Turn one kind of job into a guide that gets better every run.'
  assert_contains "$sk" '${CLAUDE_SKILL_DIR}/scripts/evolvebook.sh'
  # the skill is the slash command: a same-named command file would shadow it in Claude Code
  assert_not_exists "$ROOT_DIR/templates/claude/commands/evolvebook.md"
  assert_contains "$sk" '`/evolvebook` is this skill'
  tpl="$ROOT_DIR/templates/claude/skills/evolvebook/book/SKILL.md.tpl"
  sed -n '2,4p' "$tpl" | grep -qx 'name: {{name}}' || fail 'book template must carry a name'
  assert_not_exists "$ROOT_DIR/templates/claude/skills/evolvebook/book/SKILL.md"
  pass 'evolvebook skill is registered, valid, and is its own slash command'
}

test_evolvebook_unconfigured_asks_for_setup() {
  EBH=$(eb_home unconfigured)
  out="$TMP_ROOT/eb-unconf.txt"
  eb where >"$out"
  assert_contains "$out" 'configured=no'
  rc=0; eb new article >"$out" 2>&1 || rc=$?
  [ "$rc" -eq 3 ] || fail "new without a home must exit 3, got $rc"
  assert_contains "$out" '/evolvebook setup'
  eb list >"$out"; assert_contains "$out" 'not configured'
  eb hook >"$out"; [ ! -s "$out" ] || fail 'hook must be silent when not configured'
  assert_not_exists "$EBH/.evolvebooks"
  pass 'evolvebook without a home points to setup and writes nothing'
}

test_evolvebook_home_resolution_order() {
  EBH=$(eb_home order)
  proj="$TMP_ROOT/eb-order-proj"; mkdir -p "$proj/sub/deep"
  EBD="$proj/sub/deep"
  mkdir -p "$EBH/.evolvebooks"; : > "$EBH/.evolvebooks/EVOLVEBOOKS.md"
  eb where | grep -qx "home=$EBH/.evolvebooks" || fail 'default home must be used last'
  mkdir -p "$EBH/.config/evolvebooks"; printf '{ "home": "~/from-config" }\n' > "$EBH/.config/evolvebooks/config.json"
  eb where | grep -qx "home=$EBH/from-config" || fail 'user config must beat the default'
  printf '{ "home": "books" }\n' > "$proj/.evolvebooks.json"
  eb where | grep -qx "home=$proj/books" || fail '.evolvebooks.json (walking up) must beat the user config'
  (cd "$EBD" && HOME=$EBH EVOLVEBOOKS_HOME=/tmp/from-env sh "$EB_SCRIPT" where) | grep -qx 'home=/tmp/from-env' || fail 'EVOLVEBOOKS_HOME must win'
  EBD=''
  pass 'evolvebook home order: env > .evolvebooks.json > user config > default'
}

test_evolvebook_setup_modes() {
  EBH=$(eb_home setup)
  out="$TMP_ROOT/eb-setup.txt"
  eb setup --default >"$out"
  assert_file "$EBH/.evolvebooks/EVOLVEBOOKS.md"
  [ -d "$EBH/.evolvebooks/shared" ] || fail 'setup must create shared/'
  assert_contains "$EBH/.config/evolvebooks/config.json" "$EBH/.evolvebooks"
  assert_contains "$out" '/evolvebook new'
  vault="$TMP_ROOT/eb-vault"; mkdir -p "$vault"
  eb setup --obsidian "$vault" >"$out"
  assert_contains "$out" 'does not look like an Obsidian vault'
  assert_file "$vault/Evolvebooks/EVOLVEBOOKS.md"
  eb setup --project-only >"$out"
  eb where | grep -qx 'home=project-only' || fail 'project-only mode expected'
  printf '2\n%s\nBooks\n' "$vault" > "$TMP_ROOT/eb-answers.txt"
  (cd "$TMP_ROOT" && HOME=$EBH MOSKILLS_TTY="$TMP_ROOT/eb-answers.txt" sh "$EB_SCRIPT" setup) >"$out"
  assert_file "$vault/Books/EVOLVEBOOKS.md"
  pass 'evolvebook setup: default, Obsidian, project-only, one interactive question'
}

test_evolvebook_new_creates_a_complete_book() {
  eb_book new
  for f in SKILL.md brief.md examples.md choices.md never.md check.md done.md mistakes.md toolbox/README.md; do
    assert_file "$BOOK/$f"
  done
  assert_contains "$BOOK/SKILL.md" 'name: article'
  assert_contains "$BOOK/SKILL.md" 'description: "Use when: writing a dev article.'
  assert_contains "$BOOK/SKILL.md" 'Purpose: Dev articles'
  assert_contains "$BOOK/done.md" '| Date | What | topic | format | hook | length | Manual steps |'
  assert_contains "$BOOK/choices.md" '## hook'
  assert_contains "$EBH/.evolvebooks/EVOLVEBOOKS.md" '| article | Dev articles | 0 | 0 | - | home |'
  ! grep -rq '{{' "$BOOK" || fail 'no template marker may remain'
  out="$TMP_ROOT/eb-new.txt"
  eb new article >"$out" 2>&1 && fail 'duplicate book must be refused'
  eb new tdd >"$out" 2>&1 && fail 'a book must not shadow a moskills skill'
  assert_contains "$out" 'already a moskills skill'
  eb new 'Bad Name' >"$out" 2>&1 && fail 'invalid name must be refused'
  pass 'evolvebook new creates a complete book and refuses bad names'
}

test_evolvebook_repeat_check() {
  eb_book repeat
  out="$TMP_ROOT/eb-repeat.txt"
  eb repeat article topic=angular format=tutorial hook=story length=long >"$out" || fail 'first run must pass'
  assert_contains "$out" 'PASS: no earlier runs'
  eb record article 'Signals intro' topic=angular format=tutorial hook=story length=long >/dev/null
  eb repeat article topic=Angular format=tutorial hook=question length=long >"$out" && fail '1 of 4 differing must fail'
  assert_contains "$out" 'FAIL: too close'
  assert_contains "$out" 'Same: topic, format, length'
  eb repeat article topic=nestjs format=tutorial hook=question length=long >"$out" || fail '2 of 4 differing must pass'
  rc=0; eb repeat article topic=nestjs >"$out" 2>&1 || rc=$?
  [ "$rc" -eq 5 ] || fail "missing choices must exit 5, got $rc"
  assert_contains "$out" 'missing choices: format, hook, length'
  eb repeat article topic=a format=b hook=c length=d colour=e >"$out" 2>&1 && fail 'unknown choice must be refused'
  printf 'Repeat threshold: 4\n' >> "$BOOK/choices.md"
  eb repeat article topic=nestjs format=tutorial hook=question length=short >"$out" && fail 'threshold 4 must fail at 3 differing'
  pass 'evolvebook repeat check: pass, fail, missing choices, threshold'
}

test_evolvebook_record_updates_done_list_and_index() {
  eb_book record
  eb record article 'Guards | pipes' topic=nestjs format=howto hook=stat length=short --steps 'resize images; check links' >/dev/null
  assert_contains "$BOOK/done.md" "| $(date +%Y-%m-%d) | Guards / pipes | nestjs | howto | stat | short | resize images; check links |"
  printf '\n## 2026-01-01 — First\n- Verdict: good\n' >> "$BOOK/examples.md"
  out="$TMP_ROOT/eb-list.txt"; eb list >"$out"
  assert_contains "$out" "| article | Dev articles | 1 | 1 | $(date +%Y-%m-%d) | home |"
  assert_contains "$EBH/.evolvebooks/EVOLVEBOOKS.md" '| article | Dev articles | 1 | 1 |'
  pass 'evolvebook record appends a Done row and rebuilds the index'
}

test_evolvebook_suggest_promotions() {
  eb_book suggest
  out="$TMP_ROOT/eb-suggest.txt"
  eb suggest article >"$out"; assert_contains "$out" 'Nothing to propose.'
  printf '\n## 2026-01-01 — Heavy hero image\n- Rule: webp under 200KB\n- Seen: 2\n\n## 2026-01-02 — Old one\n- Seen: 5\n- Promoted: never.md\n' >> "$BOOK/mistakes.md"
  eb record article one topic=a format=a hook=a length=a --steps 'Resize images; write alt' >/dev/null
  eb record article two topic=b format=b hook=b length=b --steps 'resize images' >/dev/null
  eb suggest article >"$out"
  assert_not_contains "$out" 'Toolbox'
  eb record article three topic=c format=c hook=c length=c --steps 'resize  images' >/dev/null
  eb suggest article >"$out"
  assert_contains "$out" 'Never list: "Heavy hero image" was seen 2 times'
  assert_not_contains "$out" 'Old one'
  assert_contains "$out" 'Toolbox: "resize images" was done by hand in 3 runs'
  assert_not_contains "$out" 'write alt'
  printf -- '- resize images -> resize.sh\n' >> "$BOOK/toolbox/README.md"
  eb suggest article >"$out"; assert_not_contains "$out" 'Toolbox'
  pass 'evolvebook suggest: Mistake at Seen 2 -> Never list, step in 3 runs -> Toolbox'
}

test_evolvebook_scan_refuses_secrets() {
  EBH=$(eb_home scan)
  s="$TMP_ROOT/eb-secret.md"
  printf 'aws AKIAABCDEFGHIJKLMNOP\n' > "$s"; eb scan "$s" >/dev/null && fail 'AWS key must be flagged'
  printf 'iban FR76 3000 6000 0112 3456 7890 189\n' > "$s"; eb scan "$s" >/dev/null && fail 'IBAN must be flagged'
  printf 'api_key = "abcd1234efgh5678"\n' > "$s"; eb scan "$s" >/dev/null && fail 'api key assignment must be flagged'
  printf -- '-----BEGIN RSA PRIVATE KEY-----\n' > "$s"; eb scan "$s" >/dev/null && fail 'private key must be flagged'
  out="$TMP_ROOT/eb-scan.txt"
  printf 'aws AKIAABCDEFGHIJKLMNOP\n' > "$s"; eb scan "$s" >"$out" || true
  assert_not_contains "$out" 'AKIA'
  eb scan "$ROOT_DIR"/templates/claude/skills/evolvebook/book/* >/dev/null || fail 'book templates must scan clean'
  pass 'evolvebook scan flags secrets without printing them'
}

test_evolvebook_export_is_one_self_contained_file() {
  eb_book export
  printf 'voice: [direct]\n' > "$EBH/.evolvebooks/shared/brand.md"
  printf 'resize\n' > "$BOOK/toolbox/resize.sh"
  out="$TMP_ROOT/eb-export.md"
  eb export article --out "$out" >/dev/null
  for f in SKILL.md brief.md examples.md choices.md never.md check.md done.md mistakes.md toolbox/resize.sh shared/brand.md; do
    assert_contains "$out" "<!-- file: $f -->"
  done
  assert_contains "$out" 'paste them back'
  printf '\nkey AKIAABCDEFGHIJKLMNOP\n' >> "$BOOK/examples.md"
  eb export article --out "$TMP_ROOT/eb-export2.md" >/dev/null 2>&1 && fail 'export with a secret must be refused'
  assert_not_exists "$TMP_ROOT/eb-export2.md"
  pass 'evolvebook export bundles one file and refuses secrets'
}

test_evolvebook_link_and_unlink() {
  eb_book link
  mkdir -p "$EBH/.claude" "$EBH/.agents/skills" "$EBH/.gemini"
  mkdir -p "$EBH/.agents/skills/mine"
  eb new mine --choices a >/dev/null
  out="$TMP_ROOT/eb-link.txt"
  eb link >"$out"
  for d in .claude/skills .agents/skills .gemini/config/skills; do
    [ "$(readlink "$EBH/$d/article")" = "$BOOK" ] || fail "expected article link in $d"
  done
  [ ! -L "$EBH/.agents/skills/mine" ] || fail 'a real folder must never be replaced'
  assert_contains "$out" 'skipped mine'
  eb link >"$out"; assert_contains "$out" 'ok      article'
  rm -rf "$BOOK"
  eb status >"$out"; assert_contains "$out" 'broken link'
  eb unlink >/dev/null
  assert_not_exists "$EBH/.claude/skills/article"
  [ -d "$EBH/.agents/skills/mine" ] || fail 'unlink must keep real folders'
  pass 'evolvebook link symlinks books into agents, never replaces, unlink cleans up'
}

test_evolvebook_project_books_win_and_link_relative() {
  eb_book project
  proj="$TMP_ROOT/eb-proj"; mkdir -p "$proj/src"
  git -C "$proj" init >/dev/null 2>&1
  EBD="$proj/src"
  eb new article --project --purpose 'Team articles' --choices 'topic' >/dev/null
  assert_file "$proj/.evolvebooks/article/SKILL.md"
  eb path article | grep -qx "$proj/.evolvebooks/article" || fail 'project book must win'
  out="$TMP_ROOT/eb-proj-list.txt"; eb list >"$out"
  assert_contains "$out" '| article | Team articles | 0 | 0 | - | project |'
  eb link >/dev/null
  [ "$(readlink "$proj/.claude/skills/article")" = '../../.evolvebooks/article' ] || fail 'project book must link relatively'
  assert_file "$proj/.claude/skills/article/SKILL.md"
  EBD=''
  pass 'evolvebook project books override personal ones and link relatively'
}

test_evolvebook_obsidian_home_stays_inside_its_folder() {
  EBH=$(eb_home vault)
  vault="$TMP_ROOT/eb-vault-scope"; mkdir -p "$vault/.obsidian" "$vault/Daily"
  printf 'private\n' > "$vault/Daily/note.md"
  before=$(cd "$vault" && find . -path ./Evolvebooks -prune -o -type f -print | sort | xargs cksum)
  eb setup --obsidian "$vault" >/dev/null
  eb new article --choices 'topic,format' >/dev/null
  eb record article one topic=a format=b >/dev/null
  eb export article --out "$vault/Evolvebooks/article-export.md" >/dev/null
  after=$(cd "$vault" && find . -path ./Evolvebooks -prune -o -type f -print | sort | xargs cksum)
  [ "$before" = "$after" ] || fail 'nothing outside the vault subfolder may change'
  assert_file "$vault/Evolvebooks/article/SKILL.md"
  pass 'evolvebook home inside a vault writes only inside its folder'
}

test_evolvebook_hook_lists_books() {
  eb_book hook
  out="$TMP_ROOT/eb-hook.json"
  eb hook >"$out"
  assert_contains "$out" '"systemMessage": "Evolvebooks: article"'
  assert_contains "$out" '"hookEventName": "SessionStart"'
  assert_contains "$ROOT_DIR/hooks/hooks.json" 'evolvebook.sh\" hook'
  pass 'evolvebook hook lists books at session start'
}

test_moskills_cli_reports_evolvebooks() {
  h=$(eb_home cli)
  project=$(make_project eb-cli)
  out="$TMP_ROOT/eb-cli.txt"
  HOME=$h run_moskills init --target "$project" >"$out"
  assert_contains "$out" 'Evolvebooks: not configured. Run /evolvebook setup'
  HOME=$h run_moskills doctor --target "$project" >"$out" || fail 'evolvebooks must not fail doctor'
  assert_contains "$out" 'evolvebooks home: not configured'
  HOME=$h run_moskills evolvebook setup --default >/dev/null
  HOME=$h run_moskills doctor --target "$project" >"$out" || fail 'doctor must still pass'
  assert_contains "$out" "evolvebooks home: $h/.evolvebooks (0 books)"
  HOME=$h run_moskills evolvebook where >"$out"
  assert_contains "$out" 'configured=yes'
  HOME=$h run_moskills status >"$out"
  assert_contains "$out" "Evolvebooks: $h/.evolvebooks"
  pass 'moskills init, doctor, status and evolvebook passthrough report evolvebooks'
}

test_project_book_passes_commit_guard() {
  h=$(eb_home guard)
  project=$(make_project eb-guard)
  git -C "$project" init >/dev/null 2>&1
  git -C "$project" config user.email tests@example.invalid
  git -C "$project" config user.name Tests
  run_moskills init --target "$project" --with-hooks >/dev/null
  (cd "$project" && HOME=$h sh "$EB_SCRIPT" setup --project-only >/dev/null && HOME=$h sh "$EB_SCRIPT" new article --choices 'topic' >/dev/null)
  git -C "$project" add -A
  git -C "$project" commit -qm init >"$TMP_ROOT/eb-guard.txt" 2>&1 || fail 'a new project book must pass the commit guard'
  pass 'a new project evolvebook passes the pre-commit guard'
}

test_one_line_install_sets_up_evolvebooks() {
  h=$(make_home eb-install)
  dest="$h/.moskills"
  out="$TMP_ROOT/eb-install.txt"
  run_install "$h" "$dest" >"$out" 2>&1 || fail 'install.sh must succeed'
  assert_file "$h/.evolvebooks/EVOLVEBOOKS.md"
  [ -L "$h/.agents/skills/evolvebook" ] || fail 'evolvebook skill must be linked into agents'
  (cd "$TMP_ROOT" && HOME=$h sh "$h/.local/bin/moskills" evolvebook new article --choices topic) >/dev/null || fail 'moskills evolvebook must work from the launcher'
  assert_file "$h/.evolvebooks/article/SKILL.md"
  pass 'one-line install gives moskills and a ready evolvebooks home'
}

test_setup_installs_claude_code_plugin() {
  h=$(make_home eb-claude)
  stub="$TMP_ROOT/claude-stub"; log="$TMP_ROOT/claude-calls.txt"
  printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s"\n' "$log" > "$stub"; chmod +x "$stub"
  : > "$log"
  HOME=$h MOSKILLS_CLAUDE=$stub MOSKILLS_NO_LAUNCHCTL=1 run_moskills setup --yes >"$TMP_ROOT/eb-claude.txt"
  assert_contains "$log" 'plugin marketplace add Mouad1/moskills'
  assert_contains "$log" 'plugin install moskills@moskills'
  assert_contains "$TMP_ROOT/eb-claude.txt" 'moskills plugin installed'
  printf '#!/bin/sh\necho "moskills@moskills"\n' > "$stub"
  HOME=$h MOSKILLS_CLAUDE=$stub MOSKILLS_NO_LAUNCHCTL=1 run_moskills setup --yes >"$TMP_ROOT/eb-claude2.txt"
  assert_contains "$TMP_ROOT/eb-claude2.txt" 'already installed'
  pass 'setup installs the Claude Code plugin when Claude Code is found'
}

test_related_skills_know_evolvebooks() {
  sk="$ROOT_DIR/templates/claude/skills"
  assert_contains "$sk/gatekeeper/SKILL.md" 'Human Check:'
  assert_contains "$sk/gatekeeper/SKILL.md" 'check.md'
  assert_contains "$sk/learn/SKILL.md" 'mistakes.md'
  assert_contains "$sk/learn/SKILL.md" 'Seen: 2'
  assert_contains "$sk/align-intent/SKILL.md" 'Self-authored under delegation'
  assert_contains "$sk/preview/SKILL.md" 'Self-authored under delegation'
  assert_contains "$ROOT_DIR/templates/managed/base.md" '/evolvebook'
  assert_contains "$ROOT_DIR/templates/managed/base.md" 'EVOLVEBOOKS.md'
  assert_contains "$ROOT_DIR/templates/managed/base.md" '/align-intent -> /evolvebook use (if a book matches)'
  pass 'gatekeeper, learn, align-intent, preview and base.md know evolvebooks'
}

test_evolvebook_documentation() {
  doc="$ROOT_DIR/docs/evolvebook.md"
  assert_file "$doc"
  [ "$(grep -c '^```mermaid' "$doc")" -ge 2 ] || fail 'docs/evolvebook.md needs the anatomy and lifecycle diagrams'
  assert_contains "$doc" '## Anatomy'
  assert_contains "$doc" '## Lifecycle'
  assert_contains "$ROOT_DIR/README.md" '## Configure evolvebooks'
  assert_contains "$ROOT_DIR/README.md" 'EVOLVEBOOKS_HOME'
  assert_contains "$ROOT_DIR/docs/command-reference.md" '## /evolvebook'
  assert_contains "$ROOT_DIR/docs/lifecycle.md" '/evolvebook use'
  pass 'evolvebook documentation and diagrams exist'
}

test_evolvebook_grow_commands_write_exact_formats() {
  eb_book grow
  out="$TMP_ROOT/eb-grow.txt"
  eb example article --verdict good --title 'Signals intro' --why 'bug story opener' --where posts/a.md >/dev/null
  assert_contains "$BOOK/examples.md" "## $(date +%Y-%m-%d) — Signals intro"
  assert_contains "$BOOK/examples.md" '- Verdict: good'
  eb example article --verdict maybe --title x --why y >"$out" 2>&1 && fail 'verdict must be good or bad'
  eb example article --verdict bad --title leak --why 'key AKIAABCDEFGHIJKLMNOP' >"$out" 2>&1 && fail 'an example with a secret must be refused'
  assert_not_contains "$BOOK/examples.md" 'AKIA'
  eb never article --never 'emojis in headings' --instead 'plain headings' >/dev/null
  assert_contains "$BOOK/never.md" '- Never: emojis in headings'
  assert_contains "$BOOK/never.md" '  Instead: plain headings'
  eb never article --never 'no instead' >"$out" 2>&1 && fail 'a Never rule without Instead must be refused'
  eb mistake article --title 'Heavy hero image' --context publish --mistake '3MB png' --rule 'webp under 200KB' >/dev/null
  eb mistake article --title 'heavy hero image' >"$out"
  assert_contains "$out" 'Seen: 2'
  [ "$(grep -c 'Heavy hero image' "$BOOK/mistakes.md")" = 1 ] || fail 'same title must raise Seen, not add an entry'
  eb suggest article >"$out"; assert_contains "$out" 'Never list: "Heavy hero image"'
  eb never article --never 'png heroes' --instead 'webp under 200KB' --from-mistake 'Heavy hero image' >/dev/null
  assert_contains "$BOOK/mistakes.md" '- Promoted: never.md'
  eb suggest article >"$out"; assert_contains "$out" 'Nothing to propose.'
  pass 'evolvebook example, never and mistake write exact formats and refuse secrets'
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
test_link_symlinks_skills_into_detected_agents
test_link_skips_agents_that_are_not_installed
test_link_is_idempotent_and_retargets_stale_links
test_link_keeps_real_folders_without_replace
test_link_replace_backs_up_real_folders
test_link_installs_working_launcher
test_unlink_removes_only_moskills_links
test_init_agents_installs_project_skills_and_agents_md
test_init_without_agents_skips_agent_files
test_sync_maintains_agent_files
test_doctor_flags_missing_agents_block
test_self_update_refuses_outside_git_checkout
test_schedule_update_writes_launch_agent
test_install_script_installs_standalone_copy
test_install_script_is_rerunnable
test_setup_yes_links_backs_up_and_schedules
test_setup_answers_no_changes_nothing
test_status_reports_links_and_updates
test_uninstall_removes_standalone_install
test_uninstall_keeps_development_clone
test_init_suggests_agents_when_agents_md_exists
test_first_commit_after_init_with_hooks_passes
test_guard_still_blocks_placeholders_in_project_files
test_version_files_are_consistent
test_documentation_exists

test_evolvebook_skill_is_registered_and_valid
test_evolvebook_unconfigured_asks_for_setup
test_evolvebook_home_resolution_order
test_evolvebook_setup_modes
test_evolvebook_new_creates_a_complete_book
test_evolvebook_repeat_check
test_evolvebook_record_updates_done_list_and_index
test_evolvebook_suggest_promotions
test_evolvebook_grow_commands_write_exact_formats
test_evolvebook_scan_refuses_secrets
test_evolvebook_export_is_one_self_contained_file
test_evolvebook_link_and_unlink
test_evolvebook_project_books_win_and_link_relative
test_evolvebook_obsidian_home_stays_inside_its_folder
test_evolvebook_hook_lists_books
test_moskills_cli_reports_evolvebooks
test_project_book_passes_commit_guard
test_one_line_install_sets_up_evolvebooks
test_setup_installs_claude_code_plugin
test_related_skills_know_evolvebooks
test_evolvebook_documentation

printf 'All tests passed: %s\n' "$pass_count"
