---
description: Install the moskills standard (managed layer + project seeds + version manifest) into the current project
allowed-tools: Bash
---

Install the moskills standard into the current project by running the CLI bundled with this plugin:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" init --target .
```

Then:

1. Show the user the command output (what was installed, what was kept).
2. Open the root `CLAUDE.md`. If it was just seeded, help the user fill the four REPLACE sections: purpose line, Stack, Project constraints (the 3-5 non-obvious rules agents must never break in this repo), and Commands. If a CLAUDE.md already existed, confirm the managed import block was appended and suggest slimming any content now covered by the standard (`.claude/standard/base.md`).
3. Verify the install:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" doctor --target .
```

4. Suggest committing: `git add -A && git commit -m "chore: install moskills standard"`.

Never edit files under `.claude/standard/`, `.claude/commands/`, or `.claude/skills/` — they are managed and overwritten by `/moskills-sync`.
