# moskills

By [Mouad Belghiti](https://belghitis.com).

moskills is my small skill pack for working with AI agents without letting the work become random.

It is the fruit of learning from engineers, experts, and successful GitHub repos. I pulled together the patterns that kept showing up: spec ideas before coding, align first, use shared language, map the system, create fast feedback loops, checkpoint progress, validate before done, leave clean handoffs, and track every implementation decision as a reproducible recipe.

The goal is simple: install once (the Claude Code plugin, or one terminal line for Antigravity, Codex and other agents), set up each project once, then use clear commands when the agent needs structure.

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

moskills installs a versioned **standard** into each project: managed files
owned by the tool (`.claude/standard/`, commands, skills, guard hook) that
upgrades rewrite, plus project seeds you own (`CLAUDE.md`, `.claude/STATE.md`,
`tasks/`) that are created once and never touched again.

Pick your route. Neither needs a manual clone.

| You use | Install |
|---|---|
| Claude Code | the plugin, below |
| Antigravity, Codex, other agents | one terminal line, see [Other agents](#other-agents-antigravity-codex-) |
| Both | both; they share nothing and do not conflict |

### Claude Code

The `moskills` CLI ships inside the plugin and is driven by its meta-commands.
From inside Claude Code, add the marketplace once, then install:

```text
/plugin marketplace add Mouad1/moskills
/plugin install moskills@moskills
```

This makes all skills and slash commands available globally. Then, inside each
project that should carry the standard:

```text
/moskills-init
```

This installs the managed layer (`.claude/standard/`, commands, skills, guard
hook), seeds project files once (`CLAUDE.md`, `.claude/STATE.md`, `tasks/`),
adds `.claude/settings.local.json` to `.gitignore`, and records the installed
version in `.moskills.json`.

To also install the Git pre-commit guard (blocks conflict markers and risky
placeholder phrases in staged files), pass `--with-hooks` to init — the
`/moskills-init` command offers it, or run the CLI directly:

```text
sh "${CLAUDE_PLUGIN_ROOT}/moskills" init --target . --with-hooks
```

### Updating

Updates are automatic once auto-update is on for the marketplace
(`/plugin` → **Marketplaces** → moskills → enable auto-update; third-party
marketplaces start with it off). Claude Code then pulls every new release from
`main` at session start. A release is picked up only when `version` is bumped
(the test suite keeps `VERSION`, `plugin.json`, `marketplace.json` and the
CHANGELOG in step).

To update by hand instead:

```text
/plugin marketplace update moskills
/plugin update moskills@moskills
```

Each project keeps its own standard version in `.moskills.json`. At session
start the plugin compares it with the installed plugin and, when they differ,
shows one line:

```text
moskills standard v0.6.0 is older than the plugin v0.6.2: run /moskills-sync
```

Then, inside that project:

```text
/moskills-sync
```

`/moskills-doctor` reports drift: outdated version, hand-edited managed files,
missing project files. `moskills notice --target <path>` prints the same
one-line check from a terminal.

### Developing moskills locally

Keep your normal install on the GitHub marketplace and load a working copy
for one session only:

```sh
claude --plugin-dir ~/path/to/moskills
```

Do not register a working clone as a directory marketplace: Claude Code would
install whatever branch happens to be checked out.

### Legacy: copy script (deprecated)

Deprecated — kept for existing installs only; use the plugin above. Run from a
clone of this repository to copy the `.claude/` folder into one project:

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

## Other agents (Antigravity, Codex, …)

moskills skills are plain `SKILL.md` folders, so any agent that reads that
format can use them. No Claude Code needed.

**1. Install once: paste one line in a terminal.**

```sh
curl -fsSL https://raw.githubusercontent.com/Mouad1/moskills/main/install.sh | sh
```

It downloads moskills to `~/.moskills` (with git when available, otherwise a
plain download), adds the `moskills` command to `~/.local/bin`, then asks up to
three questions. Enter accepts the default (yes):

1. Link moskills to the agents it found (Antigravity, Codex)?
2. Back up and replace old copies of moskills skills? (only asked if some exist)
3. Update moskills automatically every day? (macOS; on Linux it prints a cron line)

Prefer to read the script first:

```sh
curl -fsSL https://raw.githubusercontent.com/Mouad1/moskills/main/install.sh -o install.sh
less install.sh
sh install.sh
```

Running the line again is safe: it updates the install and re-checks the links.
`MOSKILLS_YES=1` accepts every default without asking.

Where the skills go:

| Agent | Global skills folder |
|---|---|
| Antigravity | `~/.gemini/config/skills/` |
| Codex (and `.agents` readers) | `~/.agents/skills/` |

They are links to `~/.moskills`, so every update reaches every agent at once.
Folders that are not moskills links are never touched without your yes; old
copies are backed up to `~/.moskills-backups/` first.

**2. Per project:**

```sh
moskills init --agents     # or: moskills sync --agents on an existing project
```

This also writes `.agents/skills/` and a managed block in `AGENTS.md`, which
Antigravity and Codex read at the start of a session. The block tells the
agent to run `moskills notice`, so version drift is reported there too.
`moskills init` suggests `--agents` when it sees an `AGENTS.md` or another agent.

The project must be the agent's workspace. The Antigravity IDE does this when
you open the folder; the `agy` CLI does not use the current directory by
default, so start it with `agy --add-dir .`.

**3. Day to day:**

| Command | Does |
|---|---|
| `moskills status` | Version, linked agents, command on PATH, daily update and last run |
| `moskills setup` | Run the questions again (new agent installed, changed your mind) |
| `moskills self-update` | Update now instead of waiting for the daily run |
| `moskills uninstall` | Remove the links, the daily update and `~/.moskills` |

Requirements: `sh` plus git, curl or wget. macOS and Linux; on Windows use WSL.
Automatic updates need the git install.

For development, keep a separate clone and do not point `MOSKILLS_HOME` at
it: `self-update` refuses to run on a branch other than `main` or with local
changes, and `uninstall` never deletes a folder it did not install.

## What users get

Files inside their own project after `/moskills-init`:

- `CLAUDE.md` (root): seeded once, yours to edit — imports the standard through a managed marker block.
- `.claude/standard/`: the managed rules — base router, three-tier delegation model, session protocol. Owned by moskills, rewritten on sync.
- `.claude/commands/`: slash commands they can call directly.
- `.claude/skills/`: deeper workflows the agent can load when needed.
- `.claude/STATE.md`: durable context outside the chat window.
- `tasks/`: seeded todo and lessons files, yours to edit.
- `.moskills.json`: records the installed standard version for `doctor`/`sync`.
- `.claude/hooks/agent-guard.sh`: staged-file guard script.
- `.git/hooks/pre-commit`: installed only with `--with-hooks`.
- `.gitignore` entry keeping `.claude/settings.local.json` out of version control.

## What I use in this repo

This repo keeps the source of the pack:

- `moskills`: the CLI (`init` / `sync` / `doctor` / `version`) bundled into the plugin.
- `templates/managed/`: the managed standard files copied to `.claude/standard/`.
- `templates/claude/`: commands, skills, hooks, and legacy project template.
- `templates/project/`: project-owned seeds (`CLAUDE.md`, `STATE.md`, `tasks/`).
- `.claude-plugin/`: plugin and marketplace manifests.
- `commands/`: plugin meta-commands (`/moskills-init`, `/moskills-sync`, `/moskills-doctor`).
- `tests/run-tests.sh`: smoke tests for install, sync, hooks, and version consistency.
- `setupskill.sh`: legacy installer, deprecated.
- `docs/`: usage docs and examples.

## Lifecycle

Project Start -> /shared-language

New Feature -> /preview -> /align-intent -> /system-map -> Coding Phase with /tdd or /diagnose and /checkpoint -> /gatekeeper -> /project-dna -> Done

If work must pause, use `/handoff`.

## Hook Flow

Hooks are optional. They run only if init was given `--with-hooks` (works in
both the plugin CLI and the legacy script).

## Git Workflow Rule

Do not push directly to the default branch. Push a branch and open a pull request.

Internal planning files stay local. This repo ignores `tasks/` and `docs/superpowers/` so private plans, specs, and working notes are not shipped with the public pack.

```text
git commit -> .git/hooks/pre-commit -> .claude/hooks/agent-guard.sh -> allow or block commit
```

The guard checks staged files. It blocks conflict markers and selected risky placeholder phrases. It also prints simple validation suggestions, like `npm test` for Node or `pytest` for Python.

## Installed Files

```text
CLAUDE.md               # seeded once, imports the standard via marker block
.moskills.json          # installed standard version
tasks/                  # seeded todo + lessons files, project-owned
.claude/
  STATE.md
  settings.local.json   # local settings, git-ignored
  standard/
    base.md
    delegation.md
    session-protocol.md
    .manifest.sum       # checksums of managed files, used by doctor
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

From your machine (Antigravity, Codex install): `moskills uninstall`. It
removes the links, the daily update and `~/.moskills`. Claude Code plugin:
`/plugin uninstall moskills@moskills`.

From one project: remove `.claude/` and `.moskills.json` from the target project, and delete the
moskills marker block (between `<!-- moskills:begin -->` and
`<!-- moskills:end -->`) from the root `CLAUDE.md` — the rest of that file and
`tasks/` are yours to keep. With `--agents`, also remove `.agents/skills/` and
the marker block in `AGENTS.md`. If `--with-hooks` was used, remove
`.git/hooks/pre-commit` only if it is the moskills wrapper and not a custom
project hook.

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
