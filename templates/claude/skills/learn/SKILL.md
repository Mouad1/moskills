---
name: learn
description: "Turns a correction into a rule in tasks/lessons.md so the same mistake never happens twice, and promotes a repeated lesson to a project rule or a skill. Use when the user corrects the agent (\"no, that's wrong\", \"again\", \"that's the third time\"), says \"remember this\", \"make it a rule\", \"always do X\" or \"never do X\", when a diagnose session ends with a root cause, or when a review rejects an approach. Use this skill whenever the user states a standing rule or repeats a correction, even if they do not say learn."
---

# Learn

Primary goal: Turn corrections into rules so the same mistake never happens twice.

This skill closes the loop that `project-dna` opens. `project-dna` records what
was built and how to replay it. `learn` records what went wrong and how to
prevent it. Together they make every session improve the next one.

## Use When

- The user corrects the agent's approach, output, or assumption.
- A `/diagnose` run ends with a confirmed root cause.
- A code review or `/gatekeeper` check rejects work for a repeatable reason.
- The agent notices it re-derived something a past session already learned.
- A lesson in `tasks/lessons.md` has fired three or more times.
- The user states a preference or rule that should apply in every project.

## Capture Steps

1. Write the lesson to `tasks/lessons.md` in the project root. Create the file
   with the header below if it does not exist.
2. Use exactly one entry per lesson. Never batch unrelated lessons.
3. State the rule in imperative form. A rule the agent cannot act on is not a
   rule.
4. Check `tasks/lessons.md` for an existing entry covering the same pattern.
   If one exists, increment its `Seen:` counter instead of duplicating.

## Active Evolvebook

When an evolvebook is active, write the lesson to the `mistakes.md` of that
book, not to `tasks/lessons.md`. An evolvebook is active when the run started
with "Using the <name> evolvebook". Use the evolvebook helper:
`evolvebook.sh mistake <book> --title ... --context ... --mistake ... --rule ...`.
A title that exists already raises its `Seen` counter. At `Seen: 2` (not 3),
propose moving the rule to the `never.md` of the book, with an "Instead" line.
The user decides; mark the entry `Promoted: never.md` on yes.

## Entry Format

```markdown
## YYYY-MM-DD — short title
- Context: what was being done
- Mistake: what went wrong or what the user corrected
- Rule: imperative prevention rule
- Seen: 1
- Scope: project | stack | universal
```

`Scope` drives promotion:

- `project`: only true here (domain quirks, this repo's conventions).
- `stack`: true for the whole stack (Angular, NestJS, BullMQ, Docker...).
- `universal`: true for any agent work anywhere.
- `personal`: the user's own preference, for every project they work on.

## Promotion Path

Session insight -> project rule -> reusable skill. Check at every capture:

1. `Seen: 3+` and `Scope: project` -> move the rule into the project
   `CLAUDE.md` (or `.claude/CLAUDE.md`), then mark the entry `Promoted: CLAUDE.md`.
2. `Scope: stack` or `universal` -> propose adding it to the moskills repo.
   Add a rule to the `SKILL.md` of the skill that owns the pattern. When no
   skill owns it, propose a new skill. Tell the user the exact target file, so
   they can commit it to moskills.
3. `Scope: personal` -> propose adding it to the personal instruction file of
   the user, not to the project. In Claude Code that file is
   `~/.claude/CLAUDE.md`; other agents have an equivalent user-level file.
4. Never promote silently. Show the user the rule and the target file first.

## Session Start

When starting work in a project that has `tasks/lessons.md`, read it before
the first code change. It is the cheapest context in the repo.

## Rules

- One lesson per entry. One entry per lesson.
- Rules are imperative and testable. "Be careful with X" is not a rule.
- Never store secrets or user-identifying data in lessons.
- Promotion requires user approval. Capture does not.
- If the lesson contradicts an existing rule in `CLAUDE.md` or a skill,
  surface the conflict instead of adding a second rule.
