---
name: diagnose
description: "Finds the root cause of a failure before any fix: reproduces it, reads the full error, traces where it starts, tests one hypothesis at a time, then fixes the cause and records the reproduction passing. Use when a test fails or tests that passed before are now red, an error or stack trace appears, a build breaks, users report wrong results or a regression after a change or deploy, something got slow, or the user asks why something fails or behaves unexpectedly, even if they do not say diagnose or debug. Not for building a new feature; use tdd."
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