---
name: gatekeeper
description: "Audits agreed scope before work is called done: runs the required checks, separates passed, failed, unknown, and not-applicable results, and reports Finished or Still not done with evidence. Use when the user asks \"Is the module done?\", \"is X done?\", \"can we ship?\", \"is this finished?\", \"ready to ship?\", or asks to make sure everything passes before a merge, a PR or a release. Use this skill whenever the user asks whether a module, feature, task, or change is done, verified or shippable, even if they do not say gatekeeper or name a check. Not for questions about what done means or how moskills works; answer those directly."
---

# Gatekeeper

Primary goal: Validate work before completion.

## Steps

1. When a run exists, start from one command: `run-state done`.
   - Its proof brief is the whole audit: scope, goal, each check and whether its proof is current, recorded commands, rules, visual proof, acceptance, verdict.
   - Use the brief only: do not open `.moskills/runs`, `run.json`, or evidence JSON. Do not judge proof from `.claude/STATE.md` or `tasks/todo.md`.
   - A non-zero exit means not done. The brief on stdout is still the result.
   - Do not run a second command to assemble that picture.
2. Re-run a check only when the brief marks it stale, failing, or missing. Use the brief's re-run command (`run-state wrap --task <id> --auto-complete -- <command>` for a behavior check). A check marked current already passed; do not re-run it. If you re-ran anything, run `run-state done` once more and report from that new brief.
3. When an evolvebook is active, include its `check.md` for items the brief does not cover. Do not re-run a check the brief marks current.
4. Record the human gate with `run-state accept --by <name>` only after the user explicitly approves. Never accept for them.
   - When the brief says that visual proof is missing, look at the changed screens: a screenshot or the running app. Then record the proof with the ingest command from the brief.
5. Compare the brief with the acceptance criteria. Record each gate as `passed`, `failed`, `unknown`, or `not applicable`, with evidence or a reason and next action. Current proof is a passed behavior gate.
6. If a required gate is failed or unknown, including requested human validation still pending, report **Still not done**. Optional unavailable checks remain explicit limitations. Never count unknown as passed.
7. Update `Validation History` in `.claude/STATE.md` from the brief. Do not edit inside the generated Run proof block; it already holds the automated results.
   - Update Finished and Still not done in `tasks/todo.md`.
   - Reuse the existing headings. Do not create a second history.

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

- When a run exists, the proof brief overrides any Markdown claim; if they disagree, fix the Markdown.
- Claim passed checks only from the proof brief or from a check you re-ran because the brief marked it stale, failing, or missing. Prefer relevant automated/browser checks to visual guessing.
- Do not hide failures or mark pending requested human validation as complete.
- No useful feedback loop means unknown; identify the smallest next check.
- Completion checks do not authorize commit, push, or merge; those require user validation separately.
