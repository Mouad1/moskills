---
description: Upgrade the installed moskills standard in the current project to the plugin's version
allowed-tools: Bash
---

Upgrade the moskills standard in the current project by running the CLI bundled with this plugin:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" sync --target .
```

Rules:

1. Show the user the output, including the version transition (e.g. v0.5.0 -> v0.6.0).
2. If the output warns about hand-edited managed files: do NOT immediately re-run with `--force`. Show the user a diff of each flagged file vs the plugin's template, and ask whether to (a) overwrite with `--force`, or (b) keep the edit — in which case recommend porting the change into the moskills repo itself so every project gets it.
3. After a clean sync, run the health check and show the result:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" doctor --target .
```

4. Suggest committing: `git add -A && git commit -m "chore: sync moskills standard"`.
5. If the version after sync is older than expected (the plugin itself is out
   of date), tell the user to run `/plugin marketplace update moskills`, then
   `/plugin update moskills@moskills`, restart, and sync again.

Then make sure this plugin keeps itself up to date:

```bash
sh "${CLAUDE_PLUGIN_ROOT}/moskills" plugin-autoupdate --check
```

If it prints `off`, ask the user: "Turn on automatic moskills updates? New
releases then install when Claude Code starts. (yes/no)". On yes, run
`sh "${CLAUDE_PLUGIN_ROOT}/moskills" plugin-autoupdate` and show its output
(it takes effect at the next Claude Code start).

