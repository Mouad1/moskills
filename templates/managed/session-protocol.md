# Session Protocol

Managed by moskills. Change this standard in the moskills repo, then run `moskills sync`.

## Start

1. Read project instructions, `.claude/STATE.md`, `tasks/todo.md`, and relevant `tasks/lessons.md` entries when present. When `.moskills/runs/` exists, run `run-state resume` first: it reopens tasks whose proof went stale and names the next ready task.
2. Inspect the current branch and working tree. Preserve existing changes; choose an appropriate branch for implementation according to project rules.
3. Restate the requested outcome briefly. Route ordinary language to needed capabilities without asking the user to remember commands.
4. For non-trivial work, record a plan, dependency order, and acceptance/gate criteria before implementation. Continue authorized work without adding approval stops for routine choices.

## During work

- Finish prerequisites before dependent tasks. Use scoped native delegation when useful; fall back to serial work explicitly.
- Checkpoint meaningful changes and evidence: commands/checks, observed results, changed files, decisions, blockers, and next actions.
- Keep gate statuses explicit: passed, failed, unknown, or not applicable. Record review pass count and unresolved findings.
- After a user correction, rejected review, or confirmed root cause, capture the preventive rule in `tasks/lessons.md`.
- When research or exploration turns up something the next session would otherwise rediscover (how a part works, a constraint, a rejected option and why), add one line under `Findings` in `.claude/STATE.md`.
- Ask before installing dependencies; show the migration plan before changing database schemas. Obtain user validation before any commit, push, or merge.

## End or pause

1. Update `.claude/STATE.md` and `tasks/todo.md` with **Finished**, **Still not done**, gate evidence, review results, and next actions. Report unknown and failed checks plainly.
2. Leave working changes intact. Ending a session does not require a commit or stash.
3. If incomplete, record a short handoff: intended result, current branch/files, prerequisites satisfied, blockers, evidence, and exact next step. Do not label pending required validation as complete.

Task and gate status come from the run record when a run exists (see Run state in `base.md`); otherwise this protocol is an instruction-based audit trail. Record only work and evidence actually observed.
