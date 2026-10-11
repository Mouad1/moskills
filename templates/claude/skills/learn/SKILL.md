---
name: learn
description: "Use when: the user corrects the agent, a diagnose session ends with a root cause, a review rejects an approach, or a captured lesson repeats and should be promoted to a project rule or a reusable skill."
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

## Capture Steps

1. Write the lesson to `tasks/lessons.md` in the project root. Create the file
   with the header below if it does not exist.
2. Use exactly one entry per lesson. Never batch unrelated lessons.
3. State the rule in imperative form. A rule the agent cannot act on is not a
   rule.
4. Check `tasks/lessons.md` for an existing entry covering the same pattern.
   If one exists, increment its `Seen:` counter instead of duplicating.

## Active Evolvebook

When an evolvebook is active (the run started with "Using the <name>
evolvebook"), write the lesson to that book's `mistakes.md` instead of
`tasks/lessons.md`, through the evolvebook helper:
`evolvebook.sh mistake <book> --title ... --context ... --mistake ... --rule ...`
(reusing an existing title raises its `Seen` counter). At
`Seen: 2` (not 3), propose moving the rule to the book's `never.md`, with an
"Instead" line. The user decides; mark the entry `Promoted: never.md` on yes.

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

## Promotion Path

Session insight -> project rule -> reusable skill. Check at every capture:

1. `Seen: 3+` and `Scope: project` -> move the rule into the project
   `CLAUDE.md` (or `.claude/CLAUDE.md`), then mark the entry `Promoted: CLAUDE.md`.
2. `Scope: stack` or `universal` -> propose adding it to the moskills repo:
   either a rule in the relevant skill's `SKILL.md`, or a new skill if no
   skill owns the pattern. Tell the user the exact target file so they can
   commit it to moskills.
3. Never promote silently. Show the user the rule and the target file first.

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
