---
name: gatekeeper
description: "Use when: verifying agreed scope before completion or distinguishing passed, failed, unknown, and not-applicable checks."
---

# Gatekeeper

Primary goal: Validate work before completion.

## Steps

1. Read the agreed scope and acceptance criteria from `.claude/STATE.md` and `tasks/todo.md` when present.
2. Determine applicable and required gates: behavior, visual presentation when affected, code/config/document quality, and human completion validation when requested. Derive actual commands from project files; do not invent them.
3. Run relevant available checks within authorization. For changed behavior, inspect useful test feedback; inspect changed visual states when presentation matters.
4. Compare observed results with acceptance criteria. Record each gate as `passed`, `failed`, `unknown`, or `not applicable`, with evidence or a reason and next action.
5. If a required gate is failed or unknown, including requested human validation still pending, report **Still not done**. Optional unavailable checks remain explicit limitations. Never count unknown as passed.
6. Update `.claude/STATE.md` under `Validation History` and its current gate table; update Finished / Still not done in `tasks/todo.md`. Reuse existing headings rather than creating duplicate histories.

## Concise report

```text
Scope checked:
Gates: behavior / visual / code / human (status, required?, evidence or reason)
Finished:
Still not done:
Limitations / next action:
```

## Rules

- Claim passed checks only from observed output or direct inspection. Prefer relevant automated/browser checks to visual guessing.
- Do not hide failures or mark pending requested human validation as complete.
- No useful feedback loop means unknown; identify the smallest next check.
- Completion checks do not authorize commit, push, or merge; those require user validation separately.
