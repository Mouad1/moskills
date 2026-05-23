---
name: diagnose
description: "Use when: debugging bugs, failing tests, broken builds, regressions, performance issues, or unexpected behavior."
---

# Diagnose

Primary goal: Find root cause before fixing.

## Steps

1. Reproduce the issue with exact command, input, or user path.
2. Read the full error output.
3. Identify what changed recently.
4. Trace where the bad value, state, or behavior starts.
5. Form one hypothesis.
6. Test that hypothesis with the smallest check.
7. Fix the root cause.
8. Run the reproduction again and record the result.

## Report Format

```text
Symptom:
Reproduction:
Evidence:
Root Cause:
Fix:
Verification:
```

## Rules

- Do not stack random fixes.
- Do not fix symptoms when the cause is still unknown.
- If three fixes fail, stop and question the approach.
- Use `/tdd` when a regression test can capture the issue.