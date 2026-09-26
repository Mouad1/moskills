# Command Reference

moskills installs slash commands into `.claude/commands/`. Each command points to a matching skill in `.claude/skills/`. Agents without slash commands (Antigravity, Codex) pick the same skills from their descriptions; see [Terminal commands](#terminal-commands-moskills-cli) for the `moskills` command itself.

## /preview

Purpose: turn a vague idea into a concrete written spec before any code is written.

Use when a feature request, spike, or product idea needs to be explored before locking intent or starting implementation.

Flow:

```text
Explore context -> Detect frontend -> Clarify -> Propose approaches -> Present design -> Write spec -> Hand off to /align-intent
```

Visual Companion: when the project is frontend (Angular, React, Vue, HTML/CSS), a browser-based mockup server starts automatically using the bundled scripts in `.claude/skills/preview/scripts/`. No external plugins required. For backend projects it is offered with consent.

Session resume: if a previous session is alive (`.preview/*/state/server-info`), it is resumed instead of starting fresh.

Expected output:

```text
Date:
Topic:
Chosen Approach:
Architecture:
Components:
Data Flow:
Error Handling:
Testing:
Non-goals:
Open Questions:
```

Rules:

- One question per message.
- No code until spec is approved.
- Decompose multi-subsystem scope before speccing.
- Next step after approval is always `/align-intent`.

## /align-intent

Purpose: prevent coding before agreement.

Use when requirements, scope, inputs, outputs, constraints, success criteria, or non-goals are unclear.

Expected output:

```text
Input:
Action:
Output:
Success:
Non-goals:
Risks:
```

Rules:

- Ask targeted questions.
- Prefer multiple-choice questions when practical.
- Stop when the intent model is clear enough to guide implementation.
- Update `.claude/STATE.md` when durable context changes.

## /shared-language

Purpose: create a shared glossary for devs, agents, and domain experts.

Use when project jargon, business terms, acronyms, or repeated explanations are slowing the work down.

Expected output:

```text
Term:
Meaning:
Use When:
Avoid Saying:
Code Names:
Example:
```

Rules:

- Do not invent domain terms.
- Mark uncertain meanings as unknown.
- Use the shared language in code names and tests when it is clear.

## /system-map

Purpose: show module relationships before changing code.

Use when architecture, module boundaries, dependency direction, or data flow matters.

Expected output:

```text
View:
Scope:
Modules:
Data Flow:
External Dependencies:
Risk Areas:
Recommended Change Boundary:
```

Modes:

- Zoom-Out: map major modules and system-level relationships.
- Zoom-In: map one module, its public surface, inputs, outputs, dependencies, and risks.

## /tdd

Purpose: create a fast feedback loop while building behavior.

Use when a feature, bugfix, or behavior change can be protected by tests.

Flow:

```text
Red -> Green -> Refactor
```

Rules:

- Write the failing test first when testing is practical.
- Confirm the test fails for the right reason.
- Implement the smallest fix.
- Run the test again before claiming success.

## /diagnose

Purpose: debug from evidence instead of guessing.

Use for bugs, failing tests, broken builds, regressions, or unexpected behavior.

Expected output:

```text
Symptom:
Reproduction:
Evidence:
Root Cause:
Fix:
Verification:
```

Rules:

- Reproduce before fixing.
- Test one hypothesis at a time.
- Use `/tdd` when a regression test can capture the issue.

## /checkpoint

Purpose: record a factual audit trail during work.

Use during long work, after meaningful file changes, before context changes, or before handing work back to another agent.

Expected output:

```text
Date:
Working:
Current:
Blocker:
Git Delta:
Commands Run:
Next:
```

Rules:

- Keep entries short and factual.
- Say `none` when there is no blocker.
- Never claim tests passed unless command output was observed.

## /gatekeeper

Purpose: validate work before completion.

Use before saying work is done, fixed, complete, or ready.

Expected output:

```text
Intent Model Checked:
Commands Run:
Feedback Loops:
Passing:
Failing:
Unknown:
Regression Risk:
Final Decision:
```

Rules:

- Run available checks when safe.
- Compare observed results against the active intent model.
- Report failing and unknown checks clearly.
- Do not treat unknown checks as passing.

## /compress-input

Purpose: make agent communication short and direct.

Use when updates are too verbose or the user asks for compressed communication.

Modes: lite, full, ultra, wenyan.

Default mode is `full`.

Inspired by `JuliusBrussee/caveman`. This local skill keeps the communication rules under a neutral command name. It does not install the real plugin, statusline, hooks, or MCP middleware.

Core rule:

```text
Output tokens only. Reasoning stays intact.
```

Helper workflows:

- `compress-commit`: terse Conventional Commit messages.
- `compress-review`: one-line PR review comments.
- `compress-stats`: summarize estimated communication savings when metrics exist.
- `compress-file <file>`: shorten memory or instruction files while preserving code, paths, URLs, and exact technical terms.

Rules:

- Drop filler.
- Keep technical terms exact.
- Say current state and next action.
- Preserve code, commands, paths, URLs, identifiers, and error text exactly.
- Switch back to normal detail for security warnings, irreversible actions, legal risk, user confusion, or complex tradeoffs.

## /memorize

Purpose: use durable memory without filling the current chat.

Use when past sessions, recurring rules, durable lessons, or project decisions should be checked or stored.

Inspired by `thedotmack/claude-mem`: automatic observation capture, progressive disclosure, and token-efficient memory search.

Past-session lookup flow:

```text
search -> timeline -> get_observations
```

Rules:

- Search memory before writing new memory.
- Use `search` first to get compact IDs.
- Use `timeline` to understand surrounding context.
- Use `get_observations` only for filtered IDs.
- Keep entries short.
- Do not store secrets.

## /handoff

Purpose: compact current work so another agent can continue.

Use before pausing, switching agents, or handing work back after a long session.

Expected output:

```text
Goal:
Current State:
Decisions:
Files Changed:
Commands Run:
Blockers:
Next Steps:
```

## /project-dna

Purpose: track implementation decisions and produce reproducible recipes.

Use after building a feature, completing a configuration, or making a significant architectural decision — so the exact same work can be reproduced in one shot by a fresh agent.

Triggers:

- Manual: `track this`, `DNA this`, `log this`, `wrap up this feature`
- Automatic: before `git commit` or `git push`

Expected output per entry:

```text
Context:
Decisions:
Validations / ACs:
Steps:
Config:
Outputs:
Replay Prompt:
```

Rules:

- Every entry ends with a self-contained Replay Prompt.
- Never write actual secret values — use `[SECRET: VAR_NAME]` placeholders.
- Steps must be precise enough for a fresh agent with zero context to follow.
- One entry per feature or decision boundary.

## /evolvebook

Purpose: turn one kind of job into a guide that improves every run. Anatomy
and lifecycle diagrams: [evolvebook.md](evolvebook.md).

| Command | Does |
|---|---|
| `/evolvebook` or `/evolvebook list` | Show every book: examples, runs, last used, where |
| `/evolvebook setup` | Choose the Home (asked automatically the first time) |
| `/evolvebook new <job>` | Create: one message (found examples + 3 questions), one summary, "ok" |
| `/evolvebook use <job>` | Run: Pick, Brief, Plan, Repeat check, Make, Check, Close. Usually automatic |
| `/evolvebook link` | Symlink your books into Claude Code, Codex and Antigravity |
| `/evolvebook export <job>` | One self-contained file for ChatGPT or Claude web |

Growing needs no command: "add this as a good example", "never do X again".

Close output (every run):

```text
Add this as an Example?
Anything that went wrong?
```

Rules:

- One message per question round; every question has a default; "you decide" is always valid.
- The repeat check and the Done list are written by the helper, never by hand.
- Nothing enters Examples, the Never list or the Toolbox without the user's yes.
- Read and write only inside the Home and the project `.evolvebooks/`.

## Terminal commands (moskills CLI)

Available as `moskills` after the one-line install
(`curl -fsSL https://raw.githubusercontent.com/Mouad1/moskills/main/install.sh | sh`), or inside Claude Code through
`/moskills-init`, `/moskills-sync` and `/moskills-doctor`.

Machine:

| Command | Purpose |
|---|---|
| `moskills setup [--yes]` | Guided first run: link agents, replace old copies, daily updates. Safe to repeat |
| `moskills status` | Version, install folder, linked agents, command on PATH, daily update |
| `moskills link [--replace]` | Link the skills into every detected agent; `--replace` backs up old folders first |
| `moskills unlink` | Remove only the links moskills created |
| `moskills self-update` | Pull the latest `main` (clean git install only), then re-link |
| `moskills schedule-update` | macOS: run `self-update` daily at 09:15 |
| `moskills uninstall [--yes]` | Remove links, daily update and the standalone install |

Project (add `--target <path>`, default is the current folder):

| Command | Purpose |
|---|---|
| `moskills init [--agents] [--with-hooks]` | Install the standard; `--agents` adds `.agents/skills/` and `AGENTS.md` |
| `moskills sync [--agents] [--force]` | Upgrade managed files to the installed version |
| `moskills doctor` | Report drift: version, edited or missing managed files |
| `moskills notice [--hook]` | One line when the project version differs from the installed one |

Evolvebooks (the same helper the `/evolvebook` skill uses):

| Command | Purpose |
|---|---|
| `moskills evolvebook setup [--default \| --home <path> \| --obsidian <vault> \| --project-only]` | Choose the Home; one question without a flag |
| `moskills evolvebook where` | Home, where it comes from, project books |
| `moskills evolvebook list` | All books, rebuilt index |
| `moskills evolvebook new <job> [--project] [--choices a,b,c]` | Create a book's files |
| `moskills evolvebook repeat <job> k=v ...` | Repeat check of a plan against the Done list |
| `moskills evolvebook record <job> "<what>" k=v ... [--steps "a; b"]` | Add a run to the Done list |
| `moskills evolvebook example <job> --verdict good\|bad --title <t> --why <w>` | Add an Example (refuses secrets) |
| `moskills evolvebook never <job> --never <x> --instead <y>` | Add a Never-list rule |
| `moskills evolvebook mistake <job> --title <t> --rule <r>` | Add a Mistake, or raise `Seen` when the title exists |
| `moskills evolvebook suggest <job>` | Promotions due (Never list, Toolbox) |
| `moskills evolvebook link` / `unlink` | Symlink books into installed agents / remove those links |
| `moskills evolvebook export <job>` | One file for web chats |
