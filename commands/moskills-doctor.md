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

This command is read-only; it never modifies files.
