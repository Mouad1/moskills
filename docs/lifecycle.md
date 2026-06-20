# Lifecycle

Project Start -> /shared-language

New Feature -> /align-intent -> /system-map -> Coding Phase with /tdd or /diagnose and /checkpoint -> /gatekeeper -> /project-dna -> Done

moskills is built around a small workflow loop. Each step gives the agent one clear job and leaves durable context in the project when needed.

For compatibility with the first release flow, this lifecycle is still valid:

```text
New Feature -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done
```

## 0. /shared-language

Use `/shared-language` near the start of a project, or whenever terms are confusing.

It turns project jargon into a glossary the user, domain expert, and agent can share. This helps names in code match the language used in the project.

## 1. New Feature

Start with the user request, issue, bug report, or change idea. Keep the initial scope visible. Do not treat unclear requirements as permission to guess.

## 2. /align-intent

Use `/align-intent` before coding when the goal, inputs, outputs, constraints, success criteria, or non-goals are unclear.

The command produces a compact logic model:

```text
Input:
Action:
Output:
Success:
Non-goals:
Risks:
```

## 3. /system-map

Use `/system-map` when the work touches multiple files, modules, data flows, or ownership boundaries.

The command identifies the relevant modules, dependencies, risk areas, and recommended change boundary before edits begin.

## 4. Coding Phase with /checkpoint

Use `/tdd` for behavior changes that can be tested. The loop is red, green, refactor.

Use `/diagnose` for bugs, failing tests, broken builds, or unexpected behavior. Reproduce first, find root cause, then fix.

Use `/checkpoint` during longer work, after meaningful changes, or before context may be lost.

The command records current state, changed files, blockers, commands run, and next steps in `.claude/STATE.md`.

## 5. /gatekeeper

Use `/gatekeeper` before reporting completion.

The command compares observed checks against the active intent model and separates passing, failing, and unknown results.

## 6. /project-dna

Use `/project-dna` after validation passes — before or at the time of committing.

The command writes a structured entry to `PROJECT-DNA.md` capturing context, decisions, steps, config, and outputs, and always ends with a Replay Prompt: a self-contained Claude prompt that reproduces the same work from scratch.

Run it manually with `track this` or `DNA this`, or let it trigger automatically before `git commit` or `git push`.

## 7. Done

Call the work done only after validation output has been observed, any remaining unknowns or risks are reported, and a DNA entry has been written.

## Optional Hooks

Hooks are installed only with `--with-hooks`.

```text
git commit -> .git/hooks/pre-commit -> .claude/hooks/agent-guard.sh -> allow or block commit
```

The hook checks staged files for conflict markers and selected risky placeholder phrases. It does not replace `/gatekeeper`; it is a last local guard before commit.

## Handoff

Use `/handoff` when another agent may need to continue the work. It writes goal, decisions, changed files, commands run, blockers, and next steps into durable context.
