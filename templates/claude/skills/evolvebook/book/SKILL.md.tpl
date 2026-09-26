---
name: {{name}}
description: "Use when: {{use_when}}. This is an evolvebook: a guide for one kind of job that improves every run."
---

# {{name}} evolvebook

Purpose: {{purpose}}

Created: {{date}}

This folder is an evolvebook. Read and write only the files in this folder and
`../shared/brand.md`. Nothing else, even when this folder sits inside a larger
vault.

## Files

| File | Holds |
|---|---|
| `brief.md` | The questions asked before starting |
| `examples.md` | What good (and bad) looks like, approved by the user |
| `choices.md` | The decisions made every run |
| `never.md` | Things we refuse, each with what to do instead |
| `check.md` | How we prove the result is good |
| `done.md` | What we already made |
| `mistakes.md` | What went wrong, and the rule we learned |
| `toolbox/` | Ready-made templates, checklists and scripts |

## Run (every time)

When the `evolvebook` skill is installed, load it and follow its **Use**
steps with this book: its helper runs the repeat check and writes the Done
list (`evolvebook.sh repeat` / `record`, also `moskills evolvebook ...`).
Never edit `done.md` by hand when the helper is available. Without it:

1. **Pick.** Say: "Using the {{name}} evolvebook (N examples, M runs)".
2. **Brief.** Ask the questions in `brief.md` in one message, each with a
   guess filled in. "You decide" means you answer them yourself and label the
   brief `Self-authored under delegation`.
3. **Plan.** Read `examples.md` and `never.md`, then write one value for every
   choice in `choices.md`.
4. **Repeat check.** Compare the plan with every row of `done.md`. It must
   differ from each row on at least half of the Choices columns (rounded up),
   unless `choices.md` sets `Repeat threshold: N`. If it fails, change the
   plan, never the Done list.
5. **Make.** Build it. Use `toolbox/` when it has something relevant.
6. **Check.** Run the automatic items in `check.md`, then the human items,
   then list what was not verified.
7. **Close.** Ask: "Add this as an Example?" and "Anything that went wrong?".
   Add one row to `done.md`, and write problems to `mistakes.md`.
