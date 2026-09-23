#!/usr/bin/env sh
# moskills installer for Antigravity, Codex and other agents (no Claude Code needed).
#
#   curl -fsSL https://raw.githubusercontent.com/Mouad1/moskills/main/install.sh | sh
#
# Installs a standalone copy in ~/.moskills (git clone when git exists, otherwise a
# download), then runs `moskills setup`. Safe to run again: it updates in place.
# Overrides: MOSKILLS_HOME (install dir), MOSKILLS_REPO (URL or local folder),
# MOSKILLS_REF (branch, default main), MOSKILLS_YES=1 (accept every default).
set -eu

REPO=${MOSKILLS_REPO:-https://github.com/Mouad1/moskills}
REF=${MOSKILLS_REF:-main}
DEST=${MOSKILLS_HOME:-$HOME/.moskills}
MARKER=.moskills-standalone

say() { printf 'moskills: %s\n' "$1"; }
die() { printf 'moskills: %s\n' "$1" >&2; exit 1; }

if [ -e "$DEST" ] && [ ! -f "$DEST/$MARKER" ] && [ ! -d "$DEST/.git" ]; then
  die "$DEST already exists and is not a moskills install. Set MOSKILLS_HOME to another folder."
fi

if [ -d "$REPO" ]; then
  # local source folder: offline install, also used by the test suite
  mkdir -p "$DEST"
  (cd "$REPO" && tar -cf - --exclude .git --exclude ./tasks .) | (cd "$DEST" && tar -xf -)
  mode=copy
elif [ -d "$DEST/.git" ]; then
  git -C "$DEST" pull --ff-only --quiet || die "could not update $DEST (local changes?)"
  mode=git
elif command -v git >/dev/null 2>&1; then
  rm -rf "$DEST"
  git clone --quiet --depth 1 --branch "$REF" "$REPO" "$DEST" || die "git clone failed: $REPO"
  mode=git
else
  url="$REPO/archive/refs/heads/$REF.tar.gz"
  rm -rf "$DEST"; mkdir -p "$DEST"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" | tar -xzf - --strip-components=1 -C "$DEST" || die "download failed: $url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url" | tar -xzf - --strip-components=1 -C "$DEST" || die "download failed: $url"
  else
    die 'need git, curl or wget'
  fi
  mode=download
fi

printf 'mode=%s\n' "$mode" > "$DEST/$MARKER"
chmod +x "$DEST/moskills"
say "installed v$(cat "$DEST/VERSION") in $DEST ($mode)"
exec sh "$DEST/moskills" setup
