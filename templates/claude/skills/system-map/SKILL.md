---
name: system-map
description: Map module relationships and change boundaries before editing code.
---

# System Map

Primary goal: Show module relationships before changes.

## Modes

- Zoom-Out: show major modules, data flow, external dependencies, and risk areas.
- Zoom-In: show one module, its public surface, dependencies, inputs, outputs, and safe change boundary.

## Steps

1. Choose Zoom-Out for broad context or Zoom-In for one module.
2. Inspect relevant files before mapping.
3. Map modules, data flow, dependencies, and risk areas.
4. Mark unknowns as unknown.
5. Write the map using the output format.
6. Update `.claude/STATE.md` under `Active System Map`.

## Output

```text
View:
Scope:
Modules:
Data Flow:
External Dependencies:
Risk Areas:
Recommended Change Boundary:
```

## Rules

- Base the map on files that were inspected.
- Mark unknowns as unknown.
- Do not invent modules or dependencies.
- Update `.claude/STATE.md` under `Active System Map`.