---
name: checkpoint
description: "Use when: recording progress, Git deltas, current state, blockers, commands run, or next steps after a work increment, or before a context switch."
---

# Checkpoint

Primary goal: Record a factual audit trail.

## Steps

1. Inspect Git status.
2. Summarize changed files by purpose.
3. Record current state, blocker, commands run, and next step.
4. Append the entry to `.claude/STATE.md` under `Checkpoints`.

## Entry Format

```text
Date:
Working:
Current:
Blocker:
Git Delta:
Commands Run:
Next:
```

## Rules

- Keep entries short and factual.
- Say `none` when there is no blocker.
- Never claim tests passed unless output was observed.