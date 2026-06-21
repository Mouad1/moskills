# moskills

By [Mouad Belghiti](https://belghitis.com).

moskills is my small skill pack for working with AI agents without letting the work become random.

It is the fruit of learning from engineers, experts, and successful GitHub repos. I pulled together the patterns that kept showing up: spec ideas before coding, align first, use shared language, map the system, create fast feedback loops, checkpoint progress, validate before done, leave clean handoffs, and track every implementation decision as a reproducible recipe.

The goal is simple: install one folder into any project, then use clear slash commands when the agent needs structure.

## Installed Commands

- `/preview`: turn a vague idea into a written spec before any code is written. Auto-starts a Visual Companion browser server for frontend projects.
- `/align-intent`: confirm goals, constraints, success criteria, non-goals, and risks before coding.
- `/shared-language`: turn project jargon into a glossary agents and humans can share.
- `/system-map`: map modules, data flow, dependencies, risk areas, and the safest change boundary.
- `/tdd`: run the red, green, refactor loop for behavior changes.
- `/diagnose`: debug by reproducing the issue and finding root cause before fixing.
- `/checkpoint`: record factual progress, Git deltas, blockers, commands run, and next steps.
- `/gatekeeper`: validate completed work against the active intent model before reporting completion.
- `/compress-input`: switch to short, direct technical communication.
- `/memorize`: use durable memory for lessons, rules, and past-session context.
- `/handoff`: compact current work so another agent can continue.
- `/project-dna`: log what was built as a structured, reproducible entry with a Replay Prompt.

## How the Agent Knows When to Use Skills

### 1. Automatic (the default)

Each skill is a folder with a `SKILL.md` file. The top of that file holds a
short description with a `Use when:` trigger line. For example:

```yaml
---
name: diagnose
description: "Use when: debugging bugs, failing tests, broken builds, regressions, performance issues, or unexpected behavior."
---
```

The agent reads these descriptions and matches them against what you are asking
for.

This is why the descriptions matter more than the command names. A precise
`Use when:` line is what makes the skill discoverable and self-triggering.

### 2. Manual (the slash command)

Typing the slash command, like `/diagnose`, forces that skill to run even if the agent did not trigger it on its own.

## Install

### Option A: Plugin (recommended, one line, updates centrally)

Install moskills as a Claude Code plugin. The skills become available in every
project, and you update them in one place instead of per project.

From inside Claude Code, add the marketplace once, then install:

```text
/plugin marketplace add Mouad1/moskills
/plugin install moskills@moskills
```

To update later, pull the latest version centrally:

```text
/plugin update moskills@moskills
```

This installs all skills and their slash commands globally. No files are
copied into your project.

### Option B: Copy script (per project, no plugin system)

Run from this repository after cloning or downloading it, to copy the `.claude/`
folder into one project:

```sh
./setupskill.sh --target /path/to/project
./setupskill.sh --target /path/to/project --with-hooks
./setupskill.sh --target /path/to/project --dry-run
./setupskill.sh --target /path/to/project --force
```

Flags:

- `--target /path/to/project`: install into a specific project directory.
- `--with-hooks`: install a Git pre-commit wrapper when the target is a Git repository.
- `--dry-run`: print planned writes without changing files.
- `--force`: overwrite existing managed files.

## What users get

Users get files inside their own project:

- `.claude/commands/`: slash commands they can call directly.
- `.claude/skills/`: deeper workflows the agent can load when needed.
- `.claude/STATE.md`: durable context outside the chat window.
- `.claude/hooks/agent-guard.sh`: optional staged-file guard.
- `.git/hooks/pre-commit`: installed only with `--with-hooks`.

## What I use in this repo

This repo keeps the source of the pack:

- `templates/claude/`: what gets copied into user projects.
- `setupskill.sh`: the installer.
- `tests/run-tests.sh`: smoke tests for install behavior and hooks.
- `docs/`: usage docs and examples.

## Lifecycle

Project Start -> /shared-language

New Feature -> /preview -> /align-intent -> /system-map -> Coding Phase with /tdd or /diagnose and /checkpoint -> /gatekeeper -> /project-dna -> Done

If work must pause, use `/handoff`.

## Hook Flow

Hooks are optional. They run only if installed with `--with-hooks`.

## Git Workflow Rule

Do not push directly to the default branch. Push a branch and open a pull request.

Internal planning files stay local. This repo ignores `tasks/` and `docs/superpowers/` so private plans, specs, and working notes are not shipped with the public pack.

```text
git commit -> .git/hooks/pre-commit -> .claude/hooks/agent-guard.sh -> allow or block commit
```

The guard checks staged files. It blocks conflict markers and selected risky placeholder phrases. It also prints simple validation suggestions, like `npm test` for Node or `pytest` for Python.

## Installed Files

```text
.claude/
  CLAUDE.md
  STATE.md
  commands/
    preview.md
    align-intent.md
    shared-language.md
    system-map.md
    tdd.md
    diagnose.md
    checkpoint.md
    gatekeeper.md
    compress-input.md
    memorize.md
    handoff.md
    project-dna.md
  skills/
    preview/
      SKILL.md
      scripts/
        start-server.sh
        stop-server.sh
        server.cjs
        helper.js
        frame-template.html
    align-intent/
      SKILL.md
    shared-language/
      SKILL.md
    system-map/
      SKILL.md
    tdd/
      SKILL.md
    diagnose/
      SKILL.md
    checkpoint/
      SKILL.md
    gatekeeper/
      SKILL.md
    compress-input/
      SKILL.md
    memorize/
      SKILL.md
    handoff/
      SKILL.md
    project-dna/
      SKILL.md
      references/
        templates.md
  hooks/
    agent-guard.sh
.git/
  hooks/
    pre-commit        # only with --with-hooks
```

## Uninstall

Remove the installed `.claude` directory from the target project. If `--with-hooks` was used, remove `.git/hooks/pre-commit` only if it is the moskills wrapper and not a custom project hook.

## More Docs

- [docs/lifecycle.md](docs/lifecycle.md)
- [docs/command-reference.md](docs/command-reference.md)
- [docs/pain-points.md](docs/pain-points.md)
- [docs/examples/node-project.md](docs/examples/node-project.md)
- [docs/examples/python-project.md](docs/examples/python-project.md)

## Who Made This

moskills is built and maintained by Mouad Belghiti.

- Website: [belghitis.com](https://belghitis.com)
- Write-up on the thinking behind it: [How I keep AI coding agents structured](https://belghitis.com)

If moskills helps you, a star on the repo and a link back to
[belghitis.com](https://belghitis.com) are appreciated.
