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

detect_stack() {
  if [ -f "$TARGET_DIR/package.json" ]; then
    printf '%s\n' 'node'
    return 0
  fi

  if [ -f "$TARGET_DIR/pyproject.toml" ] || [ -f "$TARGET_DIR/requirements.txt" ] || [ -f "$TARGET_DIR/setup.py" ]; then
    printf '%s\n' 'python'
    return 0
  fi

  printf '%s\n' 'generic'
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

install_git_hook() {
  [ "$WITH_HOOKS" -eq 1 ] || return 0

  if ! git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log 'Skip Git hook install: target is not a Git repository'
    return 0
  fi

  hook_path=$(git -C "$TARGET_DIR" rev-parse --git-path hooks/pre-commit)
  case "$hook_path" in
    /*)
      hook_dest=$hook_path
      ;;
    *)
      hook_dest=$TARGET_DIR/$hook_path
      ;;
  esac
  hook_src="$TEMPLATE_DIR/hooks/pre-commit"

  if [ -e "$hook_dest" ] && [ "$FORCE" -ne 1 ]; then
    log "Skip existing Git hook: $hook_dest"
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would copy Git hook: $hook_src -> $hook_dest"
    return 0
  fi

  mkdir -p "$(dirname "$hook_dest")"
  cp "$hook_src" "$hook_dest"
  chmod +x "$hook_dest"
}

if [ "$DRY_RUN" -eq 1 ]; then
  log 'Dry run enabled'
fi

STACK=$(detect_stack)
log "Detected stack: $STACK"

install_tree

agent_guard="$TARGET_DIR/.claude/hooks/agent-guard.sh"
if [ "$DRY_RUN" -ne 1 ] && [ -f "$agent_guard" ]; then
  chmod +x "$agent_guard"
fi

preview_scripts="$TARGET_DIR/.claude/skills/preview/scripts"
if [ "$DRY_RUN" -ne 1 ] && [ -d "$preview_scripts" ]; then
  chmod +x "$preview_scripts/start-server.sh" "$preview_scripts/stop-server.sh"
fi

install_git_hook

if [ "$DRY_RUN" -eq 1 ]; then
  command_banner='Would install commands:'
else
  command_banner='Installed commands:'
fi

cat <<DONE
$command_banner
  /preview
  /align-intent
  /shared-language
  /system-map
  /tdd
  /diagnose
  /checkpoint
  /gatekeeper
  /compress-input
  /memorize
  /handoff
DONE