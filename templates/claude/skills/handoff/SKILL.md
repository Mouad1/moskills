---
name: handoff
description: "Use when: compacting current conversation, preparing another agent to continue, pausing work, summarizing changed files, blockers, verification, and next steps."
---

# Handoff

Primary goal: Compact current work into a handoff document.

A handoff is the last checkpoint before a pause. It uses the same file and
headings as `/checkpoint`, so the next agent reads one place, not two.

## Steps

1. Read `.claude/STATE.md` when present. If a legacy `.claude/HANDOFF.md`
   exists, fold its open items into `.claude/STATE.md` and say so.
2. Inspect current Git status. When a run exists, run `run-state resume` and put its run id, finished and still-not-done tasks, and next ready task in the entry.
3. Update `Current run` in `.claude/STATE.md`: set **Status** (awaiting user,
   blocked, or parked) and **Next action / blocker**.
4. Append one entry titled `Handoff` under the existing `Checkpoints` heading,
   using the format below. Do not create a separate handoff file.
5. Keep enough detail that another agent can continue without reading the full chat.

## Format

```text
Intended result:
Branch / changed files:
Prerequisites satisfied:
Decisions:
Commands run and observed evidence:
Blockers:
Exact next step:
```

## Rules

- Separate facts from assumptions.
- Do not claim verification that was not observed; pending required checks stay Still not done.
- Include exact commands when they matter.
