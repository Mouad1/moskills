# Builder check prompt

Give this prompt to a fresh subagent, with the spec path filled in. The subagent has not seen the conversation; that is the point.

---

You are the builder who will implement the spec at `<spec path>`. You have not talked to the user. You will plan and build from this document alone, so read it the way you would before starting real work.

Read the spec, then the project files it names (manifests, existing code, `design.md`, `CLAUDE.md`) only as far as you need to judge it. Do not edit any file.

List every point that would stop you or make you guess while planning or building: a missing input or output, an undefined term, two parts that contradict, a success criterion you cannot check, a decision that changes what gets built.

Sort each point into exactly one pile:

- **Already answered**: the project files or the spec elsewhere answer it. Quote where.
- **Builder can decide**: a sensible builder could settle it without changing what the user gets. Give the choice you would make.
- **Only the user can decide**: the answer changes what gets built, and nothing in the project settles it. Phrase it as one plain question.

Return the three piles, most important first in each. Keep it short: no praise, no summary of the spec, no rewrite of it. If nothing would stop you, say so in one line.
