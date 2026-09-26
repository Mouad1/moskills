---
name: evolvebook
description: "Use when: the user runs /evolvebook; asks to create, use, list, link or export an evolvebook; says 'add this as a good example' or 'never do X again' about a kind of job; starts a task that matches a book listed in EVOLVEBOOKS.md; or has done the same kind of job 3 times without a book."
---

# Evolvebook

Primary goal: Turn one kind of job into a guide that gets better every run.

An evolvebook remembers what good looks like, what we already made, and what
went wrong. moskills says *how we work on any task*; an evolvebook says *how we
do one specific job well* (a dev article, a landing page, a NestJS module).

## Words (the only terms to use with the user)

Evolvebook, Brief, Examples, Choices, Toolbox, Never list, Check, Done list,
Mistakes list, Home. Never say "skill", "template", "frontmatter" or "script"
to the user.

## Helper

Every step that counts, compares or writes a table goes through the helper, so
the result is the same every time. Never do its job by hand.

```sh
EB="sh ${CLAUDE_SKILL_DIR}/scripts/evolvebook.sh"
```

Claude Code fills in `${CLAUDE_SKILL_DIR}`. In other agents use the folder
this file was read from (`<skill folder>/scripts/evolvebook.sh`), or
`moskills evolvebook` when the one-line install put `moskills` on the PATH.

Exit codes: `0` ok, `1` refused or check failed, `3` not configured, `4` no
such book, `5` the plan is missing Choices.

## Safety (always)

- Read and write only inside the Home (`$EB where`) and the project
  `.evolvebooks/`. When the Home is inside an Obsidian vault, the rest of the
  vault is off-limits: do not list, search or open it.
- Nothing enters Examples, the Never list or the Toolbox without the user's
  explicit yes. "You decide" is never a yes for these three: ask again, or
  leave them out.
- Add Examples, Never-list rules and Mistakes only through the helper
  (`example`, `never`, `mistake`): it writes the exact format and refuses
  secrets. For any other pasted content saved in the book, run
  `$EB scan <file>` and remove what it flags.

## Route by command

`/evolvebook` is this skill; what follows it (or `ARGUMENTS:`) picks the
section. With no arguments, run **List**.

| User types | Do |
|---|---|
| `/evolvebook` or `/evolvebook list` | **List** |
| `/evolvebook setup` | **Setup** |
| `/evolvebook new <job>` | **Create** |
| `/evolvebook use <job>`, or a task matches a book | **Use** |
| `/evolvebook link` | **Link** |
| `/evolvebook export <job>` | **Export** |
| "add this as a good example", "never do X again" | **Grow** |

Any command that returns exit `3`: run **Setup** first, then continue the
original command in the same turn. Never stop at "not configured".

## List

Run `$EB list` and show its table as is. If it prints "No evolvebooks yet",
add: "Try: /evolvebook new <job>".

## Setup

Ask exactly this, as one message, then wait:

> Where should your evolvebooks live?
> 1. Default folder `~/.evolvebooks/` (recommended if unsure)
> 2. A folder inside your Obsidian vault (give the vault path; the subfolder is `Evolvebooks/` unless you say otherwise)
> 3. Any other folder of markdown files (give the path)
> 4. Only inside projects (`.evolvebooks/` in each repo)

Map the answer ("you decide" or no answer means 1):

| Answer | Run |
|---|---|
| 1 | `$EB setup --default` |
| 2 | `$EB setup --obsidian <vault> [--subfolder <name>]` |
| 3 | `$EB setup --home <path>` |
| 4 | `$EB setup --project-only` |

Show every line it prints (warnings included). If the user ran
`/evolvebook setup` itself, then ask: "Use your evolvebooks in your other
agents too? (yes/no)" (yes: run **Link**). If Setup ran because another
command needed it, do not ask: go straight back to that command.

## Create — `/evolvebook new <job>` (3 steps, once)

The name is the job in lowercase with dashes (`article`, `landing-page`). Do
not ask the user for tools, templates or scripts: the Toolbox starts empty.

**Step 1 — one message.** Look for candidate examples: inside the Home, the
current project, `tasks/lessons.md`, and memory if a memory tool is available.
Then send one message:

```text
Creating the <job> evolvebook. I found:
  1. <path or title>
  2. ...
Three questions (short answers are fine, "you decide" works too):
  a. Which of these are good or bad, and why? One line each. Paths, links,
     pastes or screenshots are welcome.
  b. Anything we must always or never do?
  c. Who is it for?
```

**Step 2 — one-screen summary.** From the answers:

- Compare good against bad to find the **Choices**: 3 to 6 decisions that
  take a *different value on different runs* (topic, angle, hook, layout,
  palette...). Test each one: "would two good runs pick different values?"
  If not, it is a fixed rule: put it in the Never list or the Check, never in
  Choices, or the repeat check can never pass. Name each Choice with one or
  two lowercase words joined by a dash.
- Draft the **Never list**: every rule has an "Instead".
- Draft the **Check**: automatic items (commands, counts, links) and human
  items (what a person must judge).
- Draft the **Brief**: at most 8 questions, each with a default guess. When
  nothing can be guessed in advance, write `Guess: from the request`.
- **Purpose**: one line, at most 12 words.
- Brand: if `<home>/shared/brand.md` exists, read it (never write it). If it
  is missing and the job needs a brand, put this line at the end of the
  summary instead of a separate message: "No brand found. Describe it in 3
  words, or skip?" Keep the answer in the book's `brief.md` as a fixed line
  `Brand: <words>`.

Show it as one screen: Purpose, For, Choices, Brief, Never list, Check,
Examples. End with: "Reply ok, or tell me what to change."

**Step 3 — write.** After "ok":

1. `$EB new <job> --purpose "<one line>" --use-when "<when to use it>" --choices "<c1,c2,...>"`
   (add `--project` if the user wants it shared in this repo).
2. `$EB path <job>` gives the folder. Write `brief.md`, `choices.md`
   (options seen and a default for each choice) and `check.md` with the
   formats already in each file.
3. Add each approved Example with `$EB example <job> --verdict good|bad
   --title "<t>" --why "<one line>" --where "<path or link>"` and each Never
   rule with `$EB never <job> --never "<what>" --instead "<what>"`.
4. `$EB list`, then say: "The <job> evolvebook is ready. Next time you ask for
   a <job>, I will use it." If Setup ran during this Create, add: "Want it in
   your other agents too? /evolvebook link".

## Use — every run (7 steps)

1. **Pick.** Match the request against the books in `$EB list`. One match:
   say "Using the <name> evolvebook (N examples, M runs)" with N and M from
   the list. Several: ask with a numbered list. None: carry on without a book.
2. **Brief.** Send the questions from `brief.md` in **one** message, each with
   your guess filled in, then stop and wait for the reply. If the user says
   "you decide" (or "ok"), use your guesses, label the brief
   `Self-authored under delegation`, and do not ask again. Skip the Brief only
   when the user already said "you decide" in the request.
3. **Plan.** Read `examples.md`, `never.md` and `choices.md`. Write one value
   for every Choice.
4. **Repeat check.** Always run `$EB repeat <name> <choice>=<value> ...` with
   every Choice, even on the first run. `FAIL`: change the plan (never the
   Done list) and run it again until `PASS`. Exit `5`: a Choice is missing,
   add it. Show the `PASS` line to the user.
5. **Make.** Build the result. Use a Toolbox item when one fits.
6. **Check.** Run the automatic items of `check.md`, then walk through the
   human items. Report under Passing / Failing / Unknown (the `gatekeeper`
   format) and list what was **not verified**.
7. **Close.** Ask both, in one message: "Add this as an Example?" and
   "Anything that went wrong?". Record the run right away, before the answers
   come back (the Done list must never depend on a reply):
   - `$EB record <name> "<what was made>" <choice>=<value> ... --steps "<manual step>; <manual step>"`
     (`--steps` lists what you did by hand that a Toolbox item could do).
   - Something went wrong: `$EB mistake <name> --title "<short title>"
     --context "<c>" --mistake "<m>" --rule "<imperative rule>"`. Reuse the
     exact title of an existing entry when it is the same pattern: the helper
     raises `Seen` instead of adding a second entry.
   - Yes to Example: `$EB example <name> --verdict good --title "<t>" --why
     "<w>" --where "<path>"`. "You decide" or no answer: do not add it.
   - `$EB suggest <name>` and offer every line it prints (see **Evolve**).

## Grow — any time, no command needed

| User says | Do |
|---|---|
| "add this as a good (or bad) example" | Pick the book (ask if unclear), then `$EB example <name> --verdict good\|bad --title "<t>" --why "<one line>" --where "<path or link>"`. |
| "never do X again" | Show the rule with its "Instead" and ask "Save it like this?". Yes: `$EB never <name> --never "<X>" --instead "<Y>" --why "<one line>"`. |
| A correction during a run | `learn` records it in this book with `$EB mistake <name> ...`. |

## Evolve — proposals only

`$EB suggest <name>` prints what is due. Offer each line as a yes/no question.

- **Mistake -> Never list:** a mistake at `Seen: 2`. On yes, run
  `$EB never <name> --never "<what>" --instead "<what>" --from-mistake "<its title>"`
  (it also marks the mistake promoted, so it is not proposed again).
- **Repetition -> Toolbox:** a manual step in 3 runs. On yes, save it in
  `toolbox/` (template, checklist or script) and add a line to
  `toolbox/README.md`: `- <step> -> <file>`.
- **Repeated job -> new book:** the same kind of job done 3 times with no
  book. Propose `/evolvebook new <job>`.

Nothing moves without the user's yes.

## Link — `/evolvebook link`

Run `$EB link` and show every line (linked, ok, skipped). Personal books go to
each installed agent (Claude Code `~/.claude/skills`, Codex `~/.agents/skills`,
Antigravity `~/.gemini/config/skills`); project books go to the project's
`.claude/skills` (and `.agents/skills` when it exists). Links, never copies:
every run improves the book for every agent.

## Export — `/evolvebook export <job>`

Run `$EB export <job>`. Tell the user the file path and: "Upload it as project
knowledge in ChatGPT or Claude. At the end of a run there, paste the Done row
and any Mistakes back here."

## Rules

- One message per question round: Brief, Create step 1, Close.
- Every question has a default. "You decide" is always a valid answer.
- Never edit `done.md` rows or `EVOLVEBOOKS.md` by hand; the helper owns them.
- A project book wins over a personal book with the same name.
