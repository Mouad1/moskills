---
name: gatekeeper
description: "Audits agreed scope before work is called done: runs the required checks, separates passed, failed, unknown, and not-applicable results, and reports Finished or Still not done with evidence. Use when the user asks \"Is the module done?\", \"is X done?\", \"can we ship?\", \"is this finished?\", or \"ready to ship?\". Use this skill whenever the user asks whether a module, feature, task, or change is done or shippable, even if they do not say gatekeeper or name a check."
---

# Gatekeeper

Primary goal: Validate work before completion.

## Steps

1. Read the agreed scope and acceptance criteria from `.claude/STATE.md` and `tasks/todo.md` when present.
2. Determine applicable and required gates: behavior, visual presentation when affected, code/config/document quality, and human completion validation when requested. Derive actual commands from project files; do not invent them.
3. When an evolvebook is active, include its `check.md`: automatic items first, then human items. Run relevant available checks within authorization. For changed behavior, inspect useful test feedback; inspect changed visual states when presentation matters.
4. **When a run exists** (`.moskills/runs/`): run `run-state resume` first. Execute each required automated check through `run-state wrap --task <id> --auto-complete -- <command>` instead of running it by hand; its gate is `passed` only when that proof is current. A task the engine will not complete stays **Still not done**. Record the human gate with `run-state accept --by <name>` only after the user explicitly approves; never accept for them. When `run-state done` names a task whose UI changed, look at the changed screens (screenshot or running app) and record it with `run-state ingest-evidence --check visual-<task> --source screenshot --files <files>`; record it only after looking. When `docs/rules.md` exists, run `run-state rules` and report each rule declared for the run as proven, stale, failing or unproven; a required gate fails while any of them is not proven.
5. Compare observed results with acceptance criteria. Record each gate as `passed`, `failed`, `unknown`, or `not applicable`, with evidence or a reason and next action.
6. If a required gate is failed or unknown, including requested human validation still pending, report **Still not done**. Optional unavailable checks remain explicit limitations. Never count unknown as passed.
7. Update `.claude/STATE.md` under `Validation History` (when a run exists, the generated Run proof block already holds the automated results; record the gates it does not cover) and its current gate table; update Finished / Still not done in `tasks/todo.md`. Reuse existing headings rather than creating duplicate histories.

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
