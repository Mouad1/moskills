---
name: gatekeeper
description: Validate implementation against intent before reporting completion.
---

# Gatekeeper

Primary goal: Validate work before completion.

## Steps

1. Read the active intent model from `.claude/STATE.md` when present.
2. Identify relevant tests, linters, type checks, build commands, and browser checks from project files.
3. Confirm whether a `/tdd` loop was used for behavior changes when testing was practical.
4. Run available checks when safe.
5. Compare observed results against the intent model.
6. Report passing, failing, and unknown checks separately.
7. Append validation result to `.claude/STATE.md` under `Validation History`.

## Report Format

```text
Intent Model Checked:
Commands Run:
Feedback Loops:
Passing:
Failing:
Unknown:
Regression Risk:
Final Decision:
```

## Rules

- Do not hide failing checks.
- Do not treat unknown checks as passing.
- Do not say done when required validation failed.
- Prefer automated tests, static checks, and browser checks over visual guessing.
- If no feedback loop exists, name it as `Unknown` and suggest the smallest next loop.