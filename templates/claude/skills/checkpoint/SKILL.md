---
name: checkpoint
description: "Use when: recording progress, Git deltas, evidence, blockers, and next actions after meaningful work or before a context change."
---

# Checkpoint

Primary goal: Record a factual audit trail.

## Steps

1. Inspect Git status and summarize changed files by purpose; preserve existing work.
2. Record agreed scope, observed evidence, gate statuses, review pass count/findings, and the exact next action.
3. When a run exists, run `run-state resume`; it refreshes the generated **Run proof** block in `.claude/STATE.md`. Summarize from that block and never mark anything finished that the run does not; do not edit inside the block.
4. Update current state and Finished / Still not done in `.claude/STATE.md` and `tasks/todo.md`. Pending required checks remain Still not done.
5. Append history under the existing `Checkpoints` heading. Gate results under `Validation History` are owned by `/gatekeeper`; reference them instead of rewriting them. Reuse existing headings rather than creating duplicate histories.

## Entry format

```text
Date / scope:
Changed files / why:
Checks and observed evidence:
Gates / review passes / unresolved findings:
Finished:
Still not done:
Blocker / exact next action:
```

## Rules

- Keep entries short and factual; name failed and unknown checks explicitly.
- Say `none` when no blocker exists. Never claim tests passed without observed output.
- Checkpointing does not require commit or stash. Commit, push, and merge need user validation.
