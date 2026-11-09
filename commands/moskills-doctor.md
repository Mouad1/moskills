---
description: Check the current project (or a whole folder of projects) for drift from the moskills standard
allowed-tools: Bash
---

Run the moskills drift check using the CLI bundled with this plugin.

For the current project:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" doctor --target .
```

If the user asks to check all their projects, run it against the parent folder instead:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" doctor --all <projects-root>
```

Interpret the output for the user:

- `OK vX.Y.Z` — nothing to do.
- `OUTDATED` — run `/moskills-sync` to upgrade.
- `edited managed file` — someone hand-edited a standard-owned file; see `/moskills-sync` for the resolution flow.
- `missing project file` — seed it via `/moskills-init` (init never overwrites existing files).
- `NOT INSTALLED` — offer to run `/moskills-init`.

Then make sure this plugin keeps itself up to date:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" plugin-autoupdate --check
```

If it prints a `WARN` that the plugin installs from somewhere other than GitHub
(for example a local `.worktrees/...` folder), tell the user that copy does not
get updates from main, and give them the three commands from the warning to run
in Claude Code (`/plugin marketplace remove moskills`, `/plugin marketplace add
Mouad1/moskills`, `/plugin install moskills@moskills`), then restart. Do not
edit their Claude settings yourself.

If it prints `off`, ask the user: "Turn on automatic moskills updates? New
releases then install when Claude Code starts. (yes/no)". On yes, run
`sh "${CLAUDE_PLUGIN_ROOT}/moskills" plugin-autoupdate` and show its output
(it takes effect at the next Claude Code start).

Apart from that opt-in auto-update switch, this command is read-only; it never modifies files.
