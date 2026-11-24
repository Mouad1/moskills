#!/bin/sh
# Builds an isolated HOME with plugins installed the way a user installs them.
# Usage: sh evals/env-setup.sh <home-dir> <moskills-checkout> [superpowers]
# Then:  node evals/env-triggers.cjs --home <home-dir>
set -eu
home=$1; repo=$(cd "$2" && pwd); extra=${3:-}
mkdir -p "$home"
cl() { HOME=$home claude "$@"; }
cl plugin marketplace add "$repo"
cl plugin install moskills@moskills
if [ "$extra" = superpowers ]; then
  cl plugin marketplace add anthropics/claude-plugins-official
  cl plugin install superpowers@claude-plugins-official
fi
cl plugin list
