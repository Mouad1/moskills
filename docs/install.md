# Installing and updating moskills

The full install guide. The short version is in the [README](../README.md).

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
hook), seeds project files once (`CLAUDE.md`, `.claude/STATE.md`, `tasks/`,
`docs/prd.md`, `docs/rules.md`),
adds `.claude/settings.local.json` and `.moskills/runs/` to `.gitignore`, and records the installed
version in `.moskills.json`.

`.claude/STATE.md` is not on that ignore list, and the commit gate does not skip or refuse it. The file is the project's notes (goal, checkpoints, findings), so ignoring it would drop them from the repo and refusing it would block an ordinary checkpoint commit. The generated Run proof block inside the file is rewritten only when its text changes, and that text has no clock, so a prompt that does not change proof leaves the file untouched.

In a Git repository, init installs the Git pre-commit hook. It is on by
default and runs for every agent and for a `git commit` typed in a terminal.
Pass `--no-hooks` to skip installing it:

```text
sh "${CLAUDE_PLUGIN_ROOT}/moskills" init --target . --no-hooks
```

The hook blocks conflict markers and risky placeholder phrases in staged
files. It also enforces the run-proof gate: when a run exists, a commit is
refused while a staged file in that run's scope has missing, failed, or stale
proof. `MOSKILLS_NO_COMMIT_GATE=1` turns the proof check off. Claude Code runs
the same check before `git commit`; the git hook is what stops a terminal
commit from bypassing it.

On npm 11, installing Claude Code skips its postinstall unless that package's
scripts are allowed, so the `claude` binary never appears. Install it with:

```sh
npm i -g @anthropic-ai/claude-code --allow-scripts=@anthropic-ai/claude-code
```

### Updating

Updates are automatic once auto-update is on for the marketplace. Third-party
marketplaces start with it off, so turn it on once, any of these ways:

- run `/moskills-doctor` and answer yes when it offers automatic updates;
- `/plugin` → **Marketplaces** → moskills → enable auto-update;
- or add this to `~/.claude/settings.json` (the one-line install and
  `moskills plugin-autoupdate` write it for you):

```json
{
  "extraKnownMarketplaces": {
    "moskills": {
      "source": { "source": "github", "repo": "Mouad1/moskills" },
      "autoUpdate": true
    }
  }
}
```

Until it is on, the session-start line tells you when a newer moskills is
available (checked once a day; `MOSKILLS_NO_UPDATE_CHECK=1` turns it off). Claude Code then pulls every new release from
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
missing project files. It also checks that the plugin updates itself. `moskills notice --target <path>` prints the same
one-line check from a terminal.

### Developing moskills locally

Keep your normal install on the GitHub marketplace and load a working copy
for one session only:

```sh
claude --plugin-dir ~/path/to/moskills
```

Do not register a working clone as a directory marketplace: Claude Code would
install whatever branch happens to be checked out. The session-start notice,
`/moskills-doctor` and setup warn when the moskills marketplace points anywhere
other than GitHub, with the commands to switch back. Set
`MOSKILLS_LOCAL_PLUGIN=1` to silence that warning while you develop on purpose.

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
3. Set up evolvebooks in `~/.evolvebooks`? (skipped when already configured)
4. Claude Code found: install the moskills plugin there too? (only asked if `claude` is installed)
5. Update moskills automatically every day? (macOS; on Linux it prints a cron line)

So one line gives you moskills and evolvebooks in every agent on the machine,
Claude Code included.

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
| `moskills status` | In a project: five lines (Goal, Finished, Still not done, Blocker, Next). Elsewhere, or with `--verbose`: version, linked agents, command on PATH, daily update |
| `moskills setup` | Run the questions again (new agent installed, changed your mind) |
| `moskills self-update` | Update now instead of waiting for the daily run |
| `moskills uninstall` | Remove the links, the daily update and `~/.moskills` |
| `moskills evolvebook <command>` | Evolvebooks from the terminal: `setup`, `list`, `new`, `link`, `export`, `where` |
| `moskills run-state <command>` | Saved run progress with proof: `init`, `check`, `wrap`, `complete`, `resume`, `status`, `accept`, `dashboard`, ... Run `moskills run-state help` |

Requirements: `sh` plus git, curl or wget. macOS, Linux and WSL. For native Windows use the npm install (see [npm installation](npm-installation.md#native-windows)).
Automatic updates need the git install.

For development, keep a separate clone and do not point `MOSKILLS_HOME` at
it: `self-update` refuses to run on a branch other than `main` or with local
changes, and `uninstall` never deletes a folder it did not install.

## Configure evolvebooks

Your evolvebooks live in one folder, the **Home**. The first `/evolvebook`
command asks one question when none is set:

1. Default folder `~/.evolvebooks/` (recommended if unsure)
2. A folder inside your Obsidian vault (default subfolder `Evolvebooks/`)
3. Any other folder of markdown files
4. Only inside projects (`.evolvebooks/` in each repo)

Run it again anytime with `/evolvebook setup` (terminal:
`moskills evolvebook setup`). The Home is looked up in this order, first hit
wins:

| Order | Where | Use it for |
|---|---|---|
| 1 | `EVOLVEBOOKS_HOME` environment variable | A one-off or CI override |
| 2 | nearest `.evolvebooks.json` walking up: `{ "home": "<path>" }` | A repo or folder that points to shared books |
| 3 | `~/.config/evolvebooks/config.json` (written by setup) | Your normal choice |
| 4 | `~/.evolvebooks/` | The default |

Team books live in `<repo>/.evolvebooks/` and win over a personal book with
the same name. `moskills doctor` and `moskills status` show the Home;
`moskills init` tells you when it is not configured yet. Agents read and write
only inside the Home and `.evolvebooks/`: a Home inside an Obsidian vault
keeps the rest of the vault off-limits.

## Installed Files

```text
CLAUDE.md               # seeded once, imports the standard via marker block
.moskills.json          # installed standard version
tasks/                  # seeded todo + lessons files, project-owned
.claude/
  STATE.md              # project notes, tracked; the proof block changes only when proof does
  settings.local.json   # local settings, git-ignored
  standard/
    base.md
    delegation.md
    session-protocol.md
    .manifest.sum       # checksums of managed files, used by doctor
  commands/
    preview.md
    design-system.md
    align-intent.md
    shared-language.md
    system-map.md
    tdd.md
    diagnose.md
    checkpoint.md
    gatekeeper.md
    modular-build.md
    compress-input.md
    handoff.md
    project-dna.md
    learn.md
  skills/
    preview/
      SKILL.md
      scripts/
        start-server.sh
        stop-server.sh
        server.cjs
        helper.js
        frame-template.html
    design-system/
      SKILL.md
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
    modular-build/
      SKILL.md
    compress-input/
      SKILL.md
    handoff/
      SKILL.md
    project-dna/
      SKILL.md
      references/
        templates.md
    learn/
      SKILL.md
    evolvebook/
      SKILL.md
      book/             # files copied into each new evolvebook
      scripts/
        evolvebook.sh   # helper: home, index, repeat check, record, link, export
  hooks/
    agent-guard.sh
.git/
  hooks/
    pre-commit        # skipped with --no-hooks
```

## Uninstall

From your machine (Antigravity, Codex install): `moskills uninstall`. It
removes the links, the daily update and `~/.moskills`. Claude Code plugin:
`/plugin uninstall moskills@moskills`.

From one project: remove `.claude/` and `.moskills.json` from the target project, and delete the
moskills marker block (between `<!-- moskills:begin -->` and
`<!-- moskills:end -->`) from the root `CLAUDE.md` — the rest of that file and
`tasks/` are yours to keep. With `--agents`, also remove `.agents/skills/` and
the marker block in `AGENTS.md`. If the Git hook was installed, remove
`.git/hooks/pre-commit` only if it is the moskills wrapper and not a custom
project hook.

