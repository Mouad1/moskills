# Session Protocol

Managed by moskills. Do not edit — update the standard and run `moskills sync`.

## Session start

1. Read `.claude/STATE.md` — current branch, blockers, next steps.
2. Confirm the working branch (`git branch --show-current`). Never work on the default branch.
3. Restate the task in one line before doing anything.

## During the session

- Commit granularly with clear messages; never batch a day of work into one commit.
- If the user corrects you, immediately append the rule to `tasks/lessons.md` (or run `/learn`).
- Before claiming anything works, show the command output that proves it.

## Session end

1. Run `/checkpoint`: update `.claude/STATE.md` (branch, commits, gate status, blockers, next steps).
2. Commit or stash everything — nothing uncommitted is left dangling.
3. If work is incomplete and another session will continue it, run `/handoff`.

## Parking a project

If a project is paused for more than a week, write a full handoff in `.claude/STATE.md`:
what was in progress, why it stopped, exactly what to do to resume.
