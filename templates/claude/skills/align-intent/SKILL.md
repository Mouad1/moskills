---
name: align-intent
description: "Use when: requirements, scope, inputs, outputs, success criteria, or non-goals are unclear before coding or starting a new feature."
---

# Align Intent

Primary goal: Ensure agreement before coding.

## Steps

1. Restate the requested outcome in simple language.
2. Ask at most five targeted questions.
3. Prefer multiple-choice questions when practical.
4. Stop asking when intent, constraints, success criteria, and non-goals are clear.
   If the user answers "you decide", write the answers yourself, label the
   logic model `Self-authored under delegation`, and do not ask again.
5. Write the logic model.
6. Update `.claude/STATE.md` under `Current Intent Model`.

## Logic Model

```text
Input:
Action:
Output:
Success:
Non-goals:
Risks:
```

## Rules

- Do not start coding during this workflow.
- Do not ask broad questions when a targeted question would work.
- Use clear English.