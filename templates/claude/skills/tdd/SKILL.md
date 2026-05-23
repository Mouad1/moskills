---
name: tdd
description: "Use when: building a feature, changing behavior, fixing a bug with a reproducible case, adding tests, or creating feedback loops."
---

# TDD

Primary goal: Create a fast red-green-refactor feedback loop.

## Flow

```text
Red -> Green -> Refactor
```

## Steps

1. Pick one behavior from the current intent model.
2. Write the smallest failing test for that behavior.
3. Run the test and confirm it fails for the expected reason.
4. Write the smallest implementation that makes the test pass.
5. Run the test again.
6. Refactor only after tests are green.
7. Record commands run in `/checkpoint` or `/gatekeeper` when relevant.

## Good Tests

- Test behavior, not implementation details.
- Use clear names from `/shared-language` when available.
- Avoid broad tests that check many behaviors at once.
- Prefer real inputs and outputs over mocks when practical.

## Rules

- No production behavior change before a failing test when testing is practical.
- Do not call a test green unless command output was observed.
- If the project has no test setup, name that as `Unknown` in `/gatekeeper` and suggest the smallest useful test path.