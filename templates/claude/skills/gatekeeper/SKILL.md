---
name: gatekeeper
description: "Use when: verifying agreed scope before completion or distinguishing passed, failed, unknown, and not-applicable checks."
---

# Gatekeeper

Primary goal: Validate work before completion.

## Steps

1. Read the agreed scope and acceptance criteria from `.claude/STATE.md` and `tasks/todo.md` when present.
2. Determine applicable and required gates: behavior, visual presentation when affected, code/config/document quality, and human completion validation when requested. Derive actual commands from project files; do not invent them.
3. When an evolvebook is active, include its `check.md`: automatic items first, then human items. Run relevant available checks within authorization. For changed behavior, inspect useful test feedback; inspect changed visual states when presentation matters.
4. **When a run exists** (`.moskills/runs/`): run `run-state resume` first. Execute each required automated check through `run-state wrap --task <id> --auto-complete -- <command>` instead of running it by hand; its gate is `passed` only when that proof is current. A task the engine will not complete stays **Still not done**. Record the human gate with `run-state accept --by <name>` only after the user explicitly approves; never accept for them.
5. Compare observed results with acceptance criteria. Record each gate as `passed`, `failed`, `unknown`, or `not applicable`, with evidence or a reason and next action.
6. If a required gate is failed or unknown, including requested human validation still pending, report **Still not done**. Optional unavailable checks remain explicit limitations. Never count unknown as passed.
7. Update `.claude/STATE.md` under `Validation History` and its current gate table; update Finished / Still not done in `tasks/todo.md`. Reuse existing headings rather than creating duplicate histories.

## Concise report

```text
Scope checked:
Gates: behavior / visual / code / human (status, required?, evidence or reason)
Finished:
Still not done:
Human Check: pending judgement, or none when no human check applies
Limitations / next action:
```

## Rules

- When a run exists, its recorded proof overrides any Markdown claim; if they disagree, fix the Markdown.
- Claim passed checks only from observed output or direct inspection. Prefer relevant automated/browser checks to visual guessing.
- Do not hide failures or mark pending requested human validation as complete.
- No useful feedback loop means unknown; identify the smallest next check.
- Completion checks do not authorize commit, push, or merge; those require user validation separately.
