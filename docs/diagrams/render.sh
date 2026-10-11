#!/usr/bin/env sh
# Re-render every diagram in this folder: <name>.mmd -> <name>.svg + <name>.png
# Needs Node (npx) and a Chromium; set PUPPETEER_EXECUTABLE_PATH to use your own.
set -eu
cd "$(dirname "$0")"
cfg=''
if [ -n "${PUPPETEER_EXECUTABLE_PATH:-}" ]; then
  cfg=$(mktemp); printf '{"executablePath":"%s","args":["--no-sandbox"]}' "$PUPPETEER_EXECUTABLE_PATH" > "$cfg"
fi
for src in *.mmd; do
  name=${src%.mmd}
  for fmt in svg png; do
    npx -y @mermaid-js/mermaid-cli@11 ${cfg:+-p "$cfg"} -i "$src" -o "$name.$fmt" -b white -w 1400 >/dev/null
  done
  printf 'rendered %s\n' "$name"
done
[ -z "$cfg" ] || rm -f "$cfg"
