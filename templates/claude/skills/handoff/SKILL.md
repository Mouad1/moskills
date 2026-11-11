---
name: handoff
description: "Writes a handoff into .claude/STATE.md so the next session can continue: branch and changed files, decisions, blockers, verification, and the exact next step. Use when the user says \"resume\", \"pick up where we left off\", \"continue from last session\", \"pause\", or \"hand this off\". Use this skill whenever the user wants to resume, continue, or pick up earlier work, even if they do not say handoff."
---

# Handoff

Primary goal: Compact current work into a handoff document.

A handoff is the last checkpoint before a pause. It uses the same file and
headings as `/checkpoint`, so the next agent reads one place, not two.

## Steps

1. When a run exists, start from one command: `run-state resume`. Its proof brief names the run, goal, finished work, blockers, verification, and the exact next step, and do not open `.moskills/runs`, `run.json`, or evidence JSON. A check the brief marks current already passed; do not re-run it. When the brief marks a check stale, failing, or missing, copy that re-run command into Exact next step; do not run it while writing the handoff.
2. Inspect current Git status only for the branch and changed files. Do not use it to judge proof.
3. Read `.claude/STATE.md` only to update it. If a legacy `.claude/HANDOFF.md` exists, fold its open items into `.claude/STATE.md` and say so.
4. Update `Current run` in `.claude/STATE.md`: set **Status** (awaiting user, blocked, or parked) and **Next action / blocker** from the brief.
5. Append one entry titled `Handoff` under the existing `Checkpoints` heading, using the format below. Do not create a separate handoff file.
6. Keep enough detail that another agent can continue without reading the full chat.

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
- Do not re-run a check the proof brief marks current. A stale, failing, or missing check is the next step, not a command to run while writing the handoff.
- Include exact commands when they matter. Use the re-run command from the proof brief.
