---
name: handoff
description: "Use when: compacting current conversation, preparing another agent to continue, pausing work, summarizing changed files, blockers, verification, and next steps."
---

# Handoff

Primary goal: Compact current work into a handoff document.

## Steps

1. Read `.claude/STATE.md` when present.
2. Inspect current Git status.
3. Summarize the goal, decisions, files changed, commands run, blockers, and next steps.
4. Write the result to `.claude/HANDOFF.md` or append it under `Handoffs` in `.claude/STATE.md`.
5. Keep enough detail that another agent can continue without reading the full chat.

## Format

```text
Goal:
Current State:
Decisions:
Files Changed:
Commands Run:
Blockers:
Next Steps:
```

## Rules

- Separate facts from assumptions.
- Do not claim verification that was not observed.
- Include exact commands when they matter.