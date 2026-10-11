#!/usr/bin/env sh
# evolvebook helper — the mechanical half of the /evolvebook skill.
# The agent does the judgement (questions, examples, rules); this script does
# everything that must give the same answer every time: find the home, create
# a book, rebuild the index, run the repeat check, record a run, propose
# promotions, scan for secrets, link books into agents, export, session hook.
# POSIX sh, no dependencies beyond sed/awk/grep. Safe to run repeatedly.
set -eu

SELF_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SKILL_DIR=$(dirname "$SELF_DIR")
TPL_DIR="$SKILL_DIR/book"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/evolvebooks/config.json"
DEFAULT_HOME="$HOME/.evolvebooks"
INDEX=EVOLVEBOOKS.md
BOOK_FILES='brief.md examples.md choices.md never.md check.md done.md mistakes.md'

say()  { printf '%s\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1"; }
die()  { printf 'evolvebook: %s\n' "$1" >&2; exit "${2:-1}"; }
today() { date +%Y-%m-%d; }

usage() {
  cat <<'USAGE'
Usage: evolvebook.sh <command> [args]

  where                         Show the home, where it comes from, project books
  setup [--default | --home <path> | --obsidian <vault> [--subfolder <name>] | --project-only]
                                Configure the home (asks one question without a flag)
  new <name> [--project] [--purpose <text>] [--use-when <text>] [--choices <a,b,c>]
                                Create a book (files only; the agent fills them)
  path <name>                   Print the book folder (project book wins)
  list                          Rebuild the indexes and print all books
  repeat <name> key=value ...   Repeat check of a plan against the Done list
  record <name> <what> key=value ... [--steps "a; b"]
                                Append a run to the Done list, update the index
  example <name> --verdict good|bad --title <t> --why <w> [--where <path|link>]
                                Add an Example (refused when it holds a secret)
  never <name> --never <what> --instead <what> [--why <w>] [--from-mistake <title>]
                                Add a Never-list rule (and mark that mistake promoted)
  mistake <name> --title <t> [--context <c>] [--mistake <m>] [--rule <r>]
                                Add a Mistake, or raise Seen when the title exists
  suggest <name>                Promotions due: Mistakes -> Never list, steps -> Toolbox
  scan <file>...                Refuse obvious secrets (exit 1 when found)
  link                          Symlink books into installed agents
  unlink                        Remove only the links made by link
  export <name> [--out <file>]  One self-contained markdown file for web chats
  status                        One line for moskills doctor
  hook                          SessionStart JSON (silent when there is nothing to say)
USAGE
}

# ---------- small helpers ----------
expand_path() { # ~ expansion + absolute path (the folder may not exist yet)
  p=$1
  case "$p" in "~") p=$HOME ;; "~/"*) p="$HOME/${p#"~/"}" ;; esac
  case "$p" in /*) ;; *) p="$(pwd)/$p" ;; esac
  printf '%s\n' "${p%/}"
}

json_get() { # $1 = file, $2 = key -> string value (flat JSON only)
  sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" 2>/dev/null | head -1
}

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

valid_name() {
  printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9-]{0,39}$'
}

reserved_name() { # moskills skills live next to this one; a book must not shadow them
  [ "$1" = evolvebook ] && return 0
  [ -d "$(dirname "$SKILL_DIR")/$1" ]
}

# ---------- home resolution: env > .evolvebooks.json > user config > default ----------
HOME_DIR=''
HOME_SOURCE=''
PROJECT_ONLY=0

resolve_home() {
  HOME_DIR=''; HOME_SOURCE=''; PROJECT_ONLY=0
  if [ -n "${EVOLVEBOOKS_HOME:-}" ]; then
    HOME_DIR=$(expand_path "$EVOLVEBOOKS_HOME"); HOME_SOURCE=env; return 0
  fi
  d=$(pwd)
  while :; do
    if [ -f "$d/.evolvebooks.json" ]; then
      h=$(json_get "$d/.evolvebooks.json" home)
      if [ -n "$h" ]; then
        case "$h" in /*|"~"*) ;; *) h="$d/$h" ;; esac
        HOME_DIR=$(expand_path "$h"); HOME_SOURCE="$d/.evolvebooks.json"; return 0
      fi
    fi
    [ "$d" = / ] && break
    d=$(dirname "$d")
  done
  if [ -f "$CONFIG_FILE" ]; then
    if [ "$(json_get "$CONFIG_FILE" mode)" = project ]; then
      PROJECT_ONLY=1; HOME_SOURCE=config; return 0
    fi
    h=$(json_get "$CONFIG_FILE" home)
    if [ -n "$h" ]; then HOME_DIR=$(expand_path "$h"); HOME_SOURCE=config; return 0; fi
  fi
  if [ -f "$DEFAULT_HOME/$INDEX" ]; then
    HOME_DIR=$DEFAULT_HOME; HOME_SOURCE=default; return 0
  fi
  return 0
}

configured() { [ -n "$HOME_DIR" ] || [ "$PROJECT_ONLY" -eq 1 ]; }

need_config() {
  configured || die 'not configured. Run: /evolvebook setup (terminal: moskills evolvebook setup)' 3
}

project_root() { # folder that holds (or will hold) .evolvebooks/
  d=$(pwd)
  while :; do
    [ -d "$d/.evolvebooks" ] && { printf '%s\n' "$d"; return 0; }
    [ "$d" = / ] && break
    d=$(dirname "$d")
  done
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

project_books_dir() {
  r=$(project_root)
  [ -d "$r/.evolvebooks" ] && printf '%s\n' "$r/.evolvebooks"
  return 0
}

book_dir() { # $1 = name -> folder; project book wins over the home one
  p=$(project_books_dir)
  if [ -n "$p" ] && [ -f "$p/$1/SKILL.md" ]; then printf '%s\n' "$p/$1"; return 0; fi
  if [ -n "$HOME_DIR" ] && [ -f "$HOME_DIR/$1/SKILL.md" ]; then printf '%s\n' "$HOME_DIR/$1"; return 0; fi
  return 1
}

need_book() {
  valid_name "$1" || die "invalid book name: $1 (use lowercase letters, digits and dashes)"
  BOOK=$(book_dir "$1") || die "no evolvebook named '$1'. See: /evolvebook list" 4
}

# ---------- index ----------
count_examples() { grep -c '^## ' "$1/examples.md" 2>/dev/null || true; }

done_rows() { # data rows of the Done table
  awk 'sep && /^\|/ { print; next } /^\|[ -|]*$/ && /---/ { sep=1 }' "$1/done.md" 2>/dev/null
}

cell() { # $1 = row, $2 = 1-based column -> trimmed cell
  printf '%s\n' "$1" | awk -F'|' -v c="$(( $2 + 1 ))" '{ v=$c; gsub(/^[ \t]+|[ \t]+$/, "", v); print v }'
}

book_line() { # $1 = folder, $2 = where
  n=$(basename "$1")
  purpose=$(sed -n 's/^Purpose:[[:space:]]*//p' "$1/SKILL.md" | head -1)
  ex=$(count_examples "$1"); ex=${ex:-0}
  rows=$(done_rows "$1")
  if [ -n "$rows" ]; then
    runs=$(printf '%s\n' "$rows" | wc -l | tr -d ' ')
    last=$(cell "$(printf '%s\n' "$rows" | tail -1)" 1)
  else
    runs=0; last=-
  fi
  printf '| %s | %s | %s | %s | %s | %s |\n' "$n" "${purpose:--}" "$ex" "$runs" "$last" "$2"
}

write_index() { # $1 = folder holding books, $2 = where label
  loc=$1
  [ -d "$loc" ] || return 0
  {
    printf '# Evolvebooks\n\n'
    printf 'One line per book. Rebuilt by the evolvebook helper, do not edit by hand.\n\n'
    printf '| Name | Purpose | Examples | Runs | Last used | Where |\n|---|---|---|---|---|---|\n'
    for b in "$loc"/*/; do
      b=${b%/}
      [ -f "$b/SKILL.md" ] || continue
      book_line "$b" "$2"
    done
  } > "$loc/$INDEX.tmp"
  mv "$loc/$INDEX.tmp" "$loc/$INDEX"
}

refresh_indexes() {
  [ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] && write_index "$HOME_DIR" home
  p=$(project_books_dir)
  [ -n "$p" ] && write_index "$p" project
  return 0
}

book_names() { # all books, project first, no duplicates
  {
    p=$(project_books_dir)
    [ -n "$p" ] && for b in "$p"/*/; do [ -f "$b/SKILL.md" ] && basename "$b"; done
    [ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ] && for b in "$HOME_DIR"/*/; do [ -f "$b/SKILL.md" ] && basename "$b"; done
  } | awk '!seen[$0]++'
}

# ---------- commands ----------
cmd_where() {
  resolve_home
  if [ -n "$HOME_DIR" ]; then say "home=$HOME_DIR"
  elif [ "$PROJECT_ONLY" -eq 1 ]; then say 'home=project-only'
  else say 'home=none'
  fi
  say "source=${HOME_SOURCE:-none}"
  p=$(project_books_dir); say "project=${p:-none}"
  if configured; then say 'configured=yes'; else say 'configured=no'; fi
}

open_input() {
  NO_TTY=0
  if [ -n "${MOSKILLS_TTY:-}" ]; then exec 3<"$MOSKILLS_TTY"
  elif (exec 3</dev/tty) 2>/dev/null; then exec 3</dev/tty
  else NO_TTY=1
  fi
}

read_answer() { # $1 = prompt, $2 = default
  if [ "$NO_TTY" -eq 1 ]; then printf '%s%s\n' "$1" "$2"; ANSWER=$2; return 0; fi
  printf '%s' "$1"
  ANSWER=''
  read -r ANSWER <&3 || ANSWER=''
  [ -n "$ANSWER" ] || ANSWER=$2
}

write_config() { # $1 = json body
  mkdir -p "$(dirname "$CONFIG_FILE")"
  printf '%s\n' "$1" > "$CONFIG_FILE"
}

init_home() { # $1 = home
  mkdir -p "$1/shared"
  [ -f "$1/$INDEX" ] || write_index "$1" home
}

cmd_setup() {
  mode=''; target=''; vault=''; sub=Evolvebooks
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --default) mode=default; shift ;;
      --home) [ "$#" -ge 2 ] || die '--home needs a path'; mode=folder; target=$2; shift 2 ;;
      --obsidian) [ "$#" -ge 2 ] || die '--obsidian needs the vault path'; mode=obsidian; vault=$2; shift 2 ;;
      --subfolder) [ "$#" -ge 2 ] || die '--subfolder needs a name'; sub=$2; shift 2 ;;
      --project-only) mode=project; shift ;;
      --yes) mode=${mode:-default}; shift ;;
      *) die "unknown setup option: $1" ;;
    esac
  done
  if [ -z "$mode" ]; then
    open_input
    say 'Where should your evolvebooks live?'
    say '  1. Default folder ~/.evolvebooks/ (recommended if unsure)'
    say '  2. A folder inside your Obsidian vault'
    say '  3. Any other folder of markdown files'
    say '  4. Only inside projects (.evolvebooks/ in each repo)'
    read_answer 'Choose 1-4 [1]: ' 1
    case "$ANSWER" in
      2) mode=obsidian; read_answer 'Vault path: ' ''; vault=$ANSWER
         read_answer 'Subfolder [Evolvebooks]: ' Evolvebooks; sub=$ANSWER ;;
      3) mode=folder; read_answer 'Folder path: ' ''; target=$ANSWER ;;
      4) mode=project ;;
      *) mode=default ;;
    esac
    [ "$mode" != obsidian ] || [ -n "$vault" ] || die 'a vault path is needed'
    [ "$mode" != folder ] || [ -n "$target" ] || die 'a folder path is needed'
  fi

  case "$mode" in
    project)
      write_config '{ "mode": "project" }'
      say 'Evolvebooks: only inside projects (.evolvebooks/ in each repo).'
      say "Config: $CONFIG_FILE"
      say 'Next: in a project, try: /evolvebook new <job>'
      return 0 ;;
    obsidian)
      vault=$(expand_path "$vault")
      [ -d "$vault" ] || die "vault not found: $vault"
      [ -d "$vault/.obsidian" ] || warn "no .obsidian/ folder in $vault: this does not look like an Obsidian vault"
      target="$vault/$sub" ;;
    default) target=$DEFAULT_HOME ;;
  esac
  target=$(expand_path "$target")
  if [ -d "$target" ] && [ ! -f "$target/$INDEX" ]; then
    others=$(find "$target" -mindepth 1 -maxdepth 1 ! -name '.*' | wc -l | tr -d ' ')
    [ "$others" -eq 0 ] || warn "$target already holds $others other items; evolvebooks will sit next to them"
  fi
  init_home "$target"
  write_config "{ \"home\": \"$(json_escape "$target")\" }"
  say "Evolvebooks home: $target"
  say "Config: $CONFIG_FILE"
  [ "$mode" = obsidian ] && say "Agents read and write only inside $target, never the rest of the vault."
  [ -n "${EVOLVEBOOKS_HOME:-}" ] && warn "EVOLVEBOOKS_HOME is set ($EVOLVEBOOKS_HOME) and wins over this config"
  say 'Next: try: /evolvebook new <job>   (then /evolvebook link to use books in other agents)'
}

subst() { # replace {{key}} markers; values are sed-escaped
  n=$(printf '%s' "$NAME" | sed 's/[&|\\]/\\&/g')
  p=$(printf '%s' "$PURPOSE" | sed 's/[&|\\]/\\&/g')
  u=$(printf '%s' "$USE_WHEN" | sed 's/[&|\\]/\\&/g; s/"/\\\\"/g')
  sed -e "s|{{name}}|$n|g" -e "s|{{purpose}}|$p|g" -e "s|{{use_when}}|$u|g" -e "s|{{date}}|$(today)|g" "$1"
}

cmd_new() {
  [ "$#" -ge 1 ] || die 'usage: new <name> [--project] [--purpose <text>] [--use-when <text>] [--choices <a,b,c>]'
  NAME=$1; shift
  where=home; PURPOSE=''; USE_WHEN=''; CHOICES=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --project) where=project; shift ;;
      --purpose) [ "$#" -ge 2 ] || die '--purpose needs text'; PURPOSE=$2; shift 2 ;;
      --use-when) [ "$#" -ge 2 ] || die '--use-when needs text'; USE_WHEN=$2; shift 2 ;;
      --choices) [ "$#" -ge 2 ] || die '--choices needs a list'; CHOICES=$2; shift 2 ;;
      *) die "unknown option: $1" ;;
    esac
  done
  valid_name "$NAME" || die "invalid book name: $NAME (use lowercase letters, digits and dashes, max 40)"
  reserved_name "$NAME" && die "'$NAME' is already a moskills skill. Pick another name, e.g. $NAME-guide"
  need_config
  [ "$PROJECT_ONLY" -eq 1 ] && where=project
  if [ "$where" = project ]; then loc="$(project_root)/.evolvebooks"; else loc=$HOME_DIR; fi
  dest="$loc/$NAME"
  [ -e "$dest" ] && die "the $NAME evolvebook already exists: $dest"
  PURPOSE=${PURPOSE:-"Guide for $NAME jobs"}
  USE_WHEN=${USE_WHEN:-"the task is a $NAME job ($PURPOSE)"}

  mkdir -p "$dest/toolbox" "$loc/shared"
  subst "$TPL_DIR/SKILL.md.tpl" > "$dest/SKILL.md"
  for f in $BOOK_FILES; do subst "$TPL_DIR/$f" > "$dest/$f"; done
  subst "$TPL_DIR/toolbox-README.md" > "$dest/toolbox/README.md"

  if [ -n "$CHOICES" ]; then
    cols=$(printf '%s' "$CHOICES" | tr ',' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^$' | tr '\n' '|' | sed 's/|$//')
    [ -n "$cols" ] || die '--choices is empty'
    head="| Date | What | $(printf '%s' "$cols" | sed 's/|/ | /g') | Manual steps |"
    seps=$(printf '%s' "$head" | awk -F'|' '{ s="|"; for (i=2;i<NF;i++) s=s "---|"; print s }')
    awk -v h="$head" -v s="$seps" '
      /^\| Date \| What \|/ { print h; getline; print s; next } { print }
    ' "$dest/done.md" > "$dest/done.md.tmp" && mv "$dest/done.md.tmp" "$dest/done.md"
    printf '%s\n' "$cols" | tr '|' '\n' | while IFS= read -r c; do
      printf '\n## %s\n\n- Options seen:\n- Default:\n' "$c"
    done >> "$dest/choices.md"
  fi
  write_index "$loc" "$where"
  say "Created the $NAME evolvebook: $dest"
}

cmd_path() {
  [ "$#" -eq 1 ] || die 'usage: path <name>'
  resolve_home; need_book "$1"; say "$BOOK"
}

cmd_list() {
  resolve_home
  refresh_indexes
  names=$(book_names)
  if [ -z "$names" ]; then
    if configured; then say 'No evolvebooks yet. Try: /evolvebook new <job>'
    else say 'Evolvebooks: not configured. Run: /evolvebook setup'
    fi
    return 0
  fi
  printf '| Name | Purpose | Examples | Runs | Last used | Where |\n|---|---|---|---|---|---|\n'
  p=$(project_books_dir)
  printf '%s\n' "$names" | while IFS= read -r n; do
    if [ -n "$p" ] && [ -f "$p/$n/SKILL.md" ]; then book_line "$p/$n" project
    else book_line "$HOME_DIR/$n" home
    fi
  done
}

choice_columns() { # $1 = book dir -> one column name per line (between What and Manual steps)
  awk -F'|' '/^\| *Date *\| *What *\|/ {
    for (i=4; i<NF-1; i++) { v=$i; gsub(/^[ \t]+|[ \t]+$/, "", v); print v }
    exit }' "$1/done.md"
}

norm() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/[[:space:]][[:space:]]*/ /g'; }

parse_plan() { # $1 = book dir, rest = key=value -> PLAN file (col<TAB>value), dies on gaps
  bdir=$1; shift
  cols=$(choice_columns "$bdir")
  [ -n "$cols" ] || die "the Done list of $(basename "$bdir") has no Choices columns. Add them to the header in done.md" 5
  PLAN=$(mktemp "${TMPDIR:-/tmp}/evolvebook-plan.XXXXXX")
  STEPS=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --steps) [ "$#" -ge 2 ] || die '--steps needs text'; STEPS=$2; shift 2; continue ;;
      *=*) ;;
      *) die "expected key=value, got: $1" ;;
    esac
    k=${1%%=*}; v=${1#*=}
    printf '%s\n' "$cols" | grep -qixF -- "$k" || die "unknown choice '$k'. Choices: $(printf '%s' "$cols" | tr '\n' ',' | sed 's/,$//; s/,/, /g')"
    printf '%s\t%s\n' "$(norm "$k")" "$v" >> "$PLAN"
    shift
  done
  missing=$(printf '%s\n' "$cols" | while IFS= read -r c; do
    grep -q "^$(norm "$c")	" "$PLAN" || printf '%s, ' "$c"
  done)
  [ -z "$missing" ] || { rm -f "$PLAN"; die "missing choices: ${missing%, }" 5; }
}

plan_value() { awk -F'\t' -v k="$(norm "$1")" '$1==k { v=$2 } END { print v }' "$PLAN"; }

threshold() { # $1 = book dir, $2 = column count
  t=$(sed -n 's/^Repeat threshold:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$1/choices.md" | head -1)
  if [ -n "$t" ]; then printf '%s\n' "$t"; else printf '%s\n' "$(( ($2 + 1) / 2 ))"; fi
}

cmd_repeat() {
  [ "$#" -ge 1 ] || die 'usage: repeat <name> key=value ...'
  resolve_home; need_book "$1"; shift
  parse_plan "$BOOK" "$@"
  cols=$(choice_columns "$BOOK")
  ncols=$(printf '%s\n' "$cols" | wc -l | tr -d ' ')
  need=$(threshold "$BOOK" "$ncols")
  rows=$(done_rows "$BOOK")
  worst=''; worst_diff=$((ncols + 1)); worst_same=''
  if [ -n "$rows" ]; then
    tmp_rows=$(mktemp "${TMPDIR:-/tmp}/evolvebook-rows.XXXXXX")
    printf '%s\n' "$rows" > "$tmp_rows"
    while IFS= read -r row; do
      i=3; diff=0; same=''
      for c in $(printf '%s\n' "$cols" | tr ' ' '\037'); do
        c=$(printf '%s' "$c" | tr '\037' ' ')
        if [ "$(norm "$(cell "$row" "$i")")" = "$(norm "$(plan_value "$c")")" ]; then same="$same$c, "
        else diff=$((diff + 1)); fi
        i=$((i + 1))
      done
      if [ "$diff" -lt "$worst_diff" ]; then worst_diff=$diff; worst=$row; worst_same=${same%, }; fi
    done < "$tmp_rows"
    rm -f "$tmp_rows"
  fi
  rm -f "$PLAN"
  if [ -z "$worst" ]; then
    say "PASS: no earlier runs (need $need of $ncols choices to differ)"; return 0
  fi
  if [ "$worst_diff" -ge "$need" ]; then
    say "PASS: differs from every earlier run on at least $need of $ncols choices (closest: $(cell "$worst" 1), $(cell "$worst" 2): $worst_diff differ)"
    return 0
  fi
  say "FAIL: too close to the run of $(cell "$worst" 1) ($(cell "$worst" 2))"
  say "Same: $worst_same"
  say "Differs on $worst_diff of $ncols choices, need $need. Change the plan, never the Done list."
  return 1
}

cmd_record() {
  [ "$#" -ge 2 ] || die 'usage: record <name> <what> key=value ... [--steps "a; b"]'
  resolve_home; need_book "$1"; what=$2; shift 2
  parse_plan "$BOOK" "$@"
  cols=$(choice_columns "$BOOK")
  clean() { printf '%s' "$1" | tr '|\n' '/ '; }
  row="| $(today) | $(clean "$what") |"
  for c in $(printf '%s\n' "$cols" | tr ' ' '\037'); do
    c=$(printf '%s' "$c" | tr '\037' ' ')
    row="$row $(clean "$(plan_value "$c")") |"
  done
  row="$row $(clean "${STEPS:--}") |"
  rm -f "$PLAN"
  [ -n "$(tail -c 1 "$BOOK/done.md")" ] && printf '\n' >> "$BOOK/done.md"
  printf '%s\n' "$row" >> "$BOOK/done.md"
  refresh_indexes
  say "Recorded in $(basename "$BOOK") Done list: $row"
}

oneline() { printf '%s' "$1" | tr '\n' ' ' | sed 's/[[:space:]]*$//'; }

parse_fields() { # --key value pairs -> F_<key> variables (dashes become underscores)
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --*) [ "$#" -ge 2 ] || die "$1 needs a value"
           k=$(printf '%s' "${1#--}" | tr '-' '_')
           printf '%s' "$k" | grep -Eq '^[a-z_]+$' || die "bad option: $1"
           eval "F_$k=\$2"; shift 2 ;;
      *) die "unexpected argument: $1" ;;
    esac
  done
}

append_scanned() { # $1 = file, $2 = entry text; appended only when it holds no secret
  tmp=$(mktemp "${TMPDIR:-/tmp}/evolvebook-entry.XXXXXX")
  printf '%s\n' "$2" > "$tmp"
  if ! cmd_scan "$tmp" >/dev/null; then
    rm -f "$tmp"; die 'refused: the entry looks like it holds a secret (key, token, IBAN). Remove it and try again.'
  fi
  rm -f "$tmp"
  [ -n "$(tail -c 1 "$1")" ] && printf '\n' >> "$1"
  printf '\n%s\n' "$2" >> "$1"
}

cmd_example() {
  [ "$#" -ge 1 ] || die 'usage: example <name> --verdict good|bad --title <t> --why <w> [--where <w>]'
  resolve_home; need_book "$1"; shift
  F_verdict=''; F_title=''; F_why=''; F_where=''
  parse_fields "$@"
  case "$F_verdict" in good|bad) ;; *) die '--verdict must be good or bad' ;; esac
  [ -n "$F_title" ] && [ -n "$F_why" ] || die '--title and --why are required'
  entry="## $(today) — $(oneline "$F_title")
- Verdict: $F_verdict
- Why: $(oneline "$F_why")"
  [ -n "$F_where" ] && entry="$entry
- Where: $(oneline "$F_where")"
  append_scanned "$BOOK/examples.md" "$entry"
  refresh_indexes
  say "Added a $F_verdict Example to $(basename "$BOOK"): $(oneline "$F_title")"
}

cmd_never() {
  [ "$#" -ge 1 ] || die 'usage: never <name> --never <what> --instead <what> [--why <w>]'
  resolve_home; need_book "$1"; shift
  F_never=''; F_instead=''; F_why=''; F_from_mistake=''
  parse_fields "$@"
  [ -n "$F_never" ] && [ -n "$F_instead" ] || die '--never and --instead are required: every rule says what to do instead'
  if [ -n "$F_from_mistake" ]; then
    mf="$BOOK/mistakes.md"
    awk -v t="$(norm "$(oneline "$F_from_mistake")")" '
      /^## / { cur=substr($0, 4); sub(/^[0-9-]+ *(—|-)+ */, "", cur); hit=(tolower(cur)==t); print; next }
      hit && /^- *Seen: *[0-9]+/ { print; print "- Promoted: never.md"; found=1; hit=0; next }
      { print }
      END { exit !found }
    ' "$mf" > "$mf.tmp" || { rm -f "$mf.tmp"; die "no mistake titled: $F_from_mistake"; }
    mv "$mf.tmp" "$mf"
  fi
  since="$(today)"; [ -n "$F_why" ] && since="$since ($(oneline "$F_why"))"
  append_scanned "$BOOK/never.md" "- Never: $(oneline "$F_never")
  Instead: $(oneline "$F_instead")
  Since: $since"
  say "Added to the $(basename "$BOOK") Never list: $(oneline "$F_never")"
}

cmd_mistake() {
  [ "$#" -ge 1 ] || die 'usage: mistake <name> --title <t> [--context <c>] [--mistake <m>] [--rule <r>]'
  resolve_home; need_book "$1"; shift
  F_title=''; F_context=''; F_mistake=''; F_rule=''
  parse_fields "$@"
  [ -n "$F_title" ] || die '--title is required'
  title=$(oneline "$F_title")
  f="$BOOK/mistakes.md"
  # same title seen before: raise its Seen counter instead of adding a second entry
  seen=$(awk -v t="$(norm "$title")" '
    function lc(s) { return tolower(s) }
    /^## / { cur=substr($0, 4); sub(/^[0-9-]+ *(—|-)+ */, "", cur); hit=(lc(cur)==t); next }
    hit && /^- *Seen: *[0-9]+/ { s=$0; gsub(/[^0-9]/, "", s); print s+0; exit }
  ' "$f")
  if [ -n "$seen" ]; then
    new=$((seen + 1))
    awk -v t="$(norm "$title")" -v n="$new" '
      function lc(s) { return tolower(s) }
      /^## / { cur=substr($0, 4); sub(/^[0-9-]+ *(—|-)+ */, "", cur); hit=(lc(cur)==t); print; next }
      hit && /^- *Seen: *[0-9]+/ { print "- Seen: " n; hit=0; next }
      { print }
    ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    say "Mistake seen again in $(basename "$BOOK"): $title (Seen: $new)"
    [ "$new" -ge 2 ] && say "Propose moving its rule to the Never list (ask the user first)."
    return 0
  fi
  [ -n "$F_rule" ] || die '--rule is required for a new mistake'
  append_scanned "$f" "## $(today) — $title
- Context: $(oneline "${F_context:--}")
- Mistake: $(oneline "${F_mistake:--}")
- Rule: $(oneline "$F_rule")
- Seen: 1"
  say "Added to the $(basename "$BOOK") Mistakes list: $title (Seen: 1)"
}

cmd_suggest() {
  [ "$#" -eq 1 ] || die 'usage: suggest <name>'
  resolve_home; need_book "$1"
  out=$(awk '
    function flush() { if (title != "" && seen >= 2 && !promoted) printf "Never list: \"%s\" was seen %d times. Propose moving its rule to never.md.\n", title, seen }
    /^## / { flush(); title=substr($0, 4); sub(/^[0-9-]+ *(—|-)+ */, "", title); seen=0; promoted=0; next }
    /^- *Seen: *[0-9]+/ { s=$0; gsub(/[^0-9]/, "", s); seen=s+0 }
    /^- *Promoted:/ { promoted=1 }
    END { flush() }
  ' "$BOOK/mistakes.md")
  saved="$BOOK/toolbox/README.md"
  steps=$(done_rows "$BOOK" | while IFS= read -r row; do
    last=$(printf '%s\n' "$row" | awk -F'|' '{ v=$(NF-1); gsub(/^[ \t]+|[ \t]+$/, "", v); print v }')
    printf '%s\n' "$last" | tr ';' '\n' | while IFS= read -r s; do
      s=$(norm "$s"); [ -n "$s" ] && [ "$s" != - ] && printf '%s\n' "$s"
    done | sort -u
  done | sort | uniq -c | awk '$1 >= 3 { n=$1; $1=""; sub(/^ /, ""); printf "%s\t%d\n", $0, n }')
  if [ -n "$steps" ]; then
    out2=$(printf '%s\n' "$steps" | while IFS="$(printf '\t')" read -r s n; do
      grep -qiF -- "$s" "$saved" 2>/dev/null && continue
      printf 'Toolbox: "%s" was done by hand in %s runs. Propose saving it as a template, checklist or script.\n' "$s" "$n"
    done)
    out=$(printf '%s\n%s' "$out" "$out2" | sed '/^$/d')
  fi
  if [ -n "$out" ]; then printf '%s\n' "$out"; else say 'Nothing to propose.'; fi
}

cmd_scan() {
  [ "$#" -ge 1 ] || die 'usage: scan <file>...'
  found=0
  for f in "$@"; do
    [ -f "$f" ] || continue
    hits=$(grep -nE \
      -e 'AKIA[0-9A-Z]{16}' \
      -e 'sk-[A-Za-z0-9_-]{20,}' \
      -e 'gh[pousr]_[A-Za-z0-9]{30,}' \
      -e 'xox[abprs]-[A-Za-z0-9-]{10,}' \
      -e 'AIza[0-9A-Za-z_-]{35}' \
      -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
      -e '(^|[^A-Za-z0-9])[A-Z]{2}[0-9]{2}( ?[A-Z0-9]{4}){3,7}( ?[A-Z0-9]{1,4})?([^A-Za-z0-9]|$)' \
      "$f" 2>/dev/null | cut -d: -f1 || true)
    hits2=$(grep -niE '(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_/+=.-]{8,}' "$f" 2>/dev/null | cut -d: -f1 || true)
    for n in $(printf '%s\n%s\n' "$hits" "$hits2" | sed '/^$/d' | sort -un); do
      say "SECRET? $f:$n (value hidden). Remove it before saving."
      found=1
    done
  done
  [ "$found" -eq 0 ] && say 'No secrets found.'
  return "$found"
}

agent_dirs() { # "agent|skills dir" for each installed agent
  [ -d "$HOME/.claude" ] && printf 'claude|%s\n' "$HOME/.claude/skills"
  [ -d "$HOME/.gemini" ] && printf 'antigravity|%s\n' "$HOME/.gemini/config/skills"
  if [ -d "$HOME/.agents" ] || [ -d "$HOME/.codex" ]; then printf 'codex|%s\n' "$HOME/.agents/skills"; fi
  return 0
}

link_one() { # $1 = source book, $2 = link path, $3 = label
  if [ -L "$2" ]; then
    cur=$(readlink "$2")
    if [ "$cur" = "$1" ]; then say "ok      $3"; return 0; fi
    case "$cur" in
      "$HOME_DIR"/*|*/.evolvebooks/*) rm "$2" ;;
      *) say "skipped $3: $2 links somewhere else"; return 0 ;;
    esac
  elif [ -e "$2" ]; then
    say "skipped $3: $2 already exists"; return 0
  fi
  mkdir -p "$(dirname "$2")"
  ln -s "$1" "$2"
  say "linked  $3"
}

cmd_link() {
  resolve_home; need_config
  n=0
  agents=$(agent_dirs)
  if [ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ]; then
    for b in "$HOME_DIR"/*/; do
      b=${b%/}; [ -f "$b/SKILL.md" ] || continue
      name=$(basename "$b"); n=$((n + 1))
      if [ -z "$agents" ]; then continue; fi
      printf '%s\n' "$agents" | while IFS='|' read -r agent dir; do
        link_one "$b" "$dir/$name" "$name -> $agent ($dir)"
      done
    done
  fi
  p=$(project_books_dir)
  if [ -n "$p" ]; then
    root=$(dirname "$p")
    for b in "$p"/*/; do
      b=${b%/}; [ -f "$b/SKILL.md" ] || continue
      name=$(basename "$b"); n=$((n + 1))
      for sd in .claude/skills .agents/skills; do
        [ -d "$root/$sd" ] || [ "$sd" = .claude/skills ] || continue
        link_one "../../.evolvebooks/$name" "$root/$sd/$name" "$name -> project $sd"
      done
    done
  fi
  [ "$n" -gt 0 ] || say 'No books to link yet. Create one: /evolvebook new <job>'
  [ -n "$agents" ] || say 'No agents found for personal books (looked for ~/.claude, ~/.gemini, ~/.agents, ~/.codex).'
  return 0
}

cmd_unlink() {
  resolve_home
  [ -n "$HOME_DIR" ] || return 0
  agent_dirs | while IFS='|' read -r agent dir; do
    [ -d "$dir" ] || continue
    for e in "$dir"/*; do
      [ -L "$e" ] || continue
      case "$(readlink "$e")" in "$HOME_DIR"/*) rm "$e"; say "removed $e ($agent)" ;; esac
    done
  done
  return 0
}

cmd_export() {
  [ "$#" -ge 1 ] || die 'usage: export <name> [--out <file>]'
  resolve_home; need_book "$1"; name=$1; shift
  out="$(pwd)/$name-evolvebook.md"
  [ "${1:-}" = --out ] && { [ "$#" -ge 2 ] || die '--out needs a file'; out=$2; }
  {
    printf '# %s evolvebook (export %s)\n\n' "$name" "$(today)"
    printf 'This file is a complete evolvebook for one kind of job. Use it as project knowledge in a web chat.\n'
    printf 'Follow the Run steps in the SKILL section. You cannot write files here: at the end of each run,\n'
    printf 'print the row to add to done.md and any new mistakes.md entry, so the user can paste them back.\n'
    for f in SKILL.md $BOOK_FILES; do
      [ -f "$BOOK/$f" ] || continue
      printf '\n---\n\n<!-- file: %s -->\n\n' "$f"
      cat "$BOOK/$f"
    done
    for f in "$BOOK"/toolbox/*; do
      [ -f "$f" ] || continue
      grep -Iq . "$f" 2>/dev/null || continue
      printf '\n---\n\n<!-- file: toolbox/%s -->\n\n' "$(basename "$f")"
      cat "$f"
    done
    brand="$(dirname "$BOOK")/shared/brand.md"
    if [ -f "$brand" ]; then
      printf '\n---\n\n<!-- file: shared/brand.md -->\n\n'
      cat "$brand"
    fi
  } > "$out"
  if ! cmd_scan "$out" >/dev/null; then
    rm -f "$out"; die 'export refused: a secret-like value was found. Run: evolvebook.sh scan on the book files'
  fi
  say "Exported the $name evolvebook: $out"
}

cmd_status() {
  resolve_home
  if [ -n "$HOME_DIR" ]; then
    n=0; [ -d "$HOME_DIR" ] && for b in "$HOME_DIR"/*/; do [ -f "$b/SKILL.md" ] && n=$((n + 1)); done
    if [ -d "$HOME_DIR" ]; then if [ "$n" -eq 1 ]; then say "evolvebooks home: $HOME_DIR (1 book)"; else say "evolvebooks home: $HOME_DIR ($n books)"; fi
    else say "evolvebooks home: $HOME_DIR (missing folder, run /evolvebook setup)"; fi
  elif [ "$PROJECT_ONLY" -eq 1 ]; then say 'evolvebooks home: project only'
  else say 'evolvebooks home: not configured (run /evolvebook setup)'
  fi
  [ -n "$HOME_DIR" ] || return 0
  agent_dirs | while IFS='|' read -r agent dir; do
    [ -d "$dir" ] || continue
    for e in "$dir"/*; do
      [ -L "$e" ] || continue
      t=$(readlink "$e")
      case "$t" in "$HOME_DIR"/*) [ -e "$e" ] || say "evolvebooks broken link ($agent): $e -> $t" ;; esac
    done
  done
  return 0
}

cmd_hook() {
  resolve_home
  configured || return 0
  names=$(book_names | tr '\n' ',' | sed 's/,$//; s/,/, /g')
  [ -n "$names" ] || return 0
  msg="Evolvebooks: $names"
  ctx="$msg. Before a task, check whether one of these evolvebooks matches it. If one does, load the evolvebook skill and follow its Use steps (the helper runs the repeat check and records the run)."
  printf '{"systemMessage": "%s", "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "%s"}}\n' \
    "$(json_escape "$msg")" "$(json_escape "$ctx")"
}

[ "$#" -ge 1 ] || { usage; exit 1; }
cmd=$1; shift
case "$cmd" in
  where)   cmd_where ;;
  setup)   cmd_setup "$@" ;;
  new)     resolve_home; cmd_new "$@" ;;
  path)    cmd_path "$@" ;;
  list|"") cmd_list ;;
  repeat)  cmd_repeat "$@" ;;
  record)  cmd_record "$@" ;;
  example) cmd_example "$@" ;;
  never)   cmd_never "$@" ;;
  mistake) cmd_mistake "$@" ;;
  suggest) cmd_suggest "$@" ;;
  scan)    cmd_scan "$@" ;;
  link)    cmd_link ;;
  unlink)  cmd_unlink ;;
  export)  cmd_export "$@" ;;
  status)  cmd_status ;;
  hook)    cmd_hook ;;
  help|-h|--help) usage ;;
  *) usage; exit 1 ;;
esac
