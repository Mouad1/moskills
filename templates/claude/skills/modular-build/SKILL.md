---
name: modular-build
description: "Use when: building an app or large feature in parts (modules, screens, layers) where each part should be tested, visually checked when it has UI, and accepted by the user before the next one starts."
---

# Modular Build

Primary goal: Build one module at a time, and start the next only when the current one is proven and accepted.

A module is one run (`run-state init --id module-<name>`): its tasks are the work, its proof comes from `/gatekeeper`, and the user's acceptance closes it. This skill adds no gate of its own; it orders runs.

## Steps

1. **Split.** With the agreed intent (`/align-intent` first if it is unclear), cut the work into modules that can each be shown working on their own: one screen, one service, one data layer. Order them so each needs only finished ones. Agree the list with the user, then record it under `## Modules` in `tasks/todo.md`: one line each, `module-<name>: <outcome> (run: module-<name>)`.
2. **Start one module.** `run-state init --id module-<name> --goal "<outcome>" --scope <files> --tasks "<t1>,<t2>"`. For every module after the first, add `--after module-<previous>`: the engine refuses to start it until the previous module is done. Never pass `--force` to get around that.
3. **Build it** test-first (`/tdd`). Record each check through the run: `run-state wrap --id module-<name> --task <task> --auto-complete -- <command>`. When the module has UI, add a visual check (a screenshot or browser test through `wrap`, or `/preview` states the user looks at) as one of its tasks.
4. **Gate it** with `/gatekeeper` on this run. Then show the user the result and ask for acceptance. Only after they say yes: `run-state accept --id module-<name> --by <name>`.
5. **Confirm done:** `run-state done --id module-<name>` must exit 0 (every task has current proof, acceptance holds). If it lists reasons, fix those; do not move on.
6. **Next module:** mark the line in `tasks/todo.md` done, then go back to step 2. `run-state list` shows every module and whether it is done.

## Rules

- One module in progress at a time. Do not edit files in a finished module's scope while building the next unless the user asks; if you must, `run-state done` on it turns false and that module comes first again.
- The user's acceptance is theirs: never run `accept` without their explicit yes in this conversation.
- If the user says "you decide" about the split, write it yourself and label it `Self-authored under delegation`.
- Report per module: `module-<name>: done` or `still not done` with the reasons `run-state done` printed.
