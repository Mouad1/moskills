# Changelog

## 0.7.1

- Automatic plugin updates, so a project never gets synced to an old plugin:
  - The session-start notice also says when a newer moskills is on GitHub
    (checked at most once a day, cached, silent offline;
    `MOSKILLS_NO_UPDATE_CHECK=1` turns it off), with the exact update commands.
  - `moskills plugin-autoupdate [--check]` turns on Claude Code auto-update
    for the moskills marketplace (`extraKnownMarketplaces.moskills.autoUpdate`
    in `~/.claude/settings.json`), keeping every other setting and never
    rewriting a settings file it cannot parse.
  - `moskills setup` (and the one-line install) turns it on when it installs
    or finds the Claude Code plugin; `/moskills-doctor` and `/moskills-sync`
    check it and offer to turn it on.

## 0.7.0

- **Evolvebooks**: a guide for one kind of job (an article, a landing page, a
  NestJS module) that remembers what good looks like, what we already made and
  what went wrong, so every run is better than the last.
  - `/evolvebook` skill, which is also its own slash command (no separate
    command file, so Claude Code always loads the full skill): `setup`,
    `new <job>`, `use <job>`, `list`, `link`, `export <job>`. Growing needs no
    command ("add this as a good example", "never do X again").
  - A book is plain markdown: Brief, Examples, Choices, Never list, Check,
    Done list, Mistakes list, Toolbox, plus a `SKILL.md` any agent can follow.
  - Helper script (`evolvebook.sh`) for everything that must be the same every
    time: home lookup (`EVOLVEBOOKS_HOME` > `.evolvebooks.json` > user config
    > `~/.evolvebooks`), index, repeat check, Done rows, Examples, Never-list
    rules and Mistakes in their exact format (a repeated Mistake raises
    `Seen`), promotion proposals
    (Mistake seen 2 times -> Never list, step in 3 runs -> Toolbox), secret
    scan, links into agents, one-file export, session-start line.
  - Homes: default folder, an Obsidian vault folder (the rest of the vault
    stays off-limits), any folder, or project-only (`.evolvebooks/`).
  - Diagrams: `docs/evolvebook.md` (anatomy, and the run mapped onto the
    moskills flow).
- `docs/diagrams/`: every diagram as Mermaid source, SVG and PNG (moskills
  workflow, evolvebook anatomy, evolvebook lifecycle), a render script, and
  a README quick tour.
- `moskills evolvebook <command>` runs the helper from a terminal.
- `moskills setup` (and so the one-line install) also sets up the evolvebooks
  home and, when Claude Code is installed, the moskills plugin there.
- `moskills doctor` and `moskills status` show the evolvebooks home (never
  fails the drift check); `moskills init` says when it is not configured.
- `gatekeeper` reports a `Human Check:` line and runs an active book's
  `check.md`; `learn` writes to the active book's Mistakes list and proposes
  the Never list at `Seen: 2`; `preview` and `align-intent` accept "you
  decide" and label the answers `Self-authored under delegation`.
- Managed `base.md`: `/evolvebook` command, lifecycle step, home-scope rule.
- Tests: the daily-update setup test no longer fails on Linux (it checks the
  cron hint there, the LaunchAgent on macOS); `assert_contains` accepts
  patterns that start with a dash.

## 0.6.5

- Fix: the pre-commit guard blocked the first commit after `init --with-hooks`
  (or after a `sync` that rewrote the hook) because it matched its own list of
  blocked phrases. The placeholder check now skips moskills-owned files (listed
  in `.claude/standard/.manifest.sum`, already verified by `doctor`); the
  conflict-marker check still covers every file.

## 0.6.4

- One-line install for Antigravity, Codex and other agents, no clone to manage:
  `curl -fsSL https://raw.githubusercontent.com/Mouad1/moskills/main/install.sh | sh`.
  Uses git when available (enables daily updates), otherwise a download.
  Re-running it updates in place.
- `moskills setup [--yes]`: guided first run with up to three yes/no questions
  (link agents, back up and replace old copies, daily updates). Safe to repeat.
- `moskills status`: version, install folder, linked agents, command on PATH,
  daily update and last run.
- `moskills uninstall [--yes]`: removes links, the daily update and the
  standalone install; never deletes a development clone.
- `moskills init` suggests `--agents` when the project has `AGENTS.md` or
  another agent is installed; `/moskills-init` offers it too.
- `self-update` ignores untracked files, so the install marker never blocks it.
- Docs: README "Install" now starts with a route picker (Claude Code plugin vs
  one-line install); command reference lists every terminal command.

## 0.6.3

- Multi-agent support: moskills now works in Antigravity, Codex, and other
  agents that read `SKILL.md` folders and `AGENTS.md`, without Claude Code.
  - `moskills link [--replace]` links the skills into every detected agent
    (`~/.gemini/config/skills`, `~/.agents/skills`) and installs the
    `~/.local/bin/moskills` launcher. Existing real folders are kept unless
    `--replace`, which backs them up to `~/.moskills-backups/`.
  - `moskills unlink` removes only the links it created.
  - `init`/`sync --agents` adds `.agents/skills/` and a managed `AGENTS.md`
    block to a project; remembered in `.moskills.json`, checked by `doctor`.
  - `moskills self-update` pulls a standalone install (clean `main` only) and
    re-links; `moskills schedule-update` runs it daily on macOS.
- Fix: `sync` no longer aborts silently when a managed file was deleted.

## 0.6.2

- New `moskills notice` command: prints one line when a project's
  `.moskills.json` version differs from the plugin (older: run
  `/moskills-sync`; newer: update the plugin). Silent otherwise, read-only,
  always exits 0. `--hook` emits Claude Code SessionStart JSON.
- Plugin now ships `hooks/hooks.json`: at session start, Claude Code shows the
  notice automatically in any project that carries the standard.
- README "Updating" documents the automatic flow (GitHub marketplace with
  auto-update + session-start notice) and local development with
  `claude --plugin-dir`.

## 0.6.1

- `moskills sync` now also ensures the `.claude/settings.local.json`
  `.gitignore` entry (previously init-only), so projects installed before
  0.6.0 pick it up on upgrade. Idempotent; skipped outside git repos.

## 0.6.0

- New managed template `delegation.md`: strict three-tier delegation model
  (Fable 5 Orchestrator / Opus Reasoner / Sonnet Executor) with the mandatory
  Findings & Decision rule — subagents stop and report, never improvise; every
  dispatch prompt must carry the stop-and-report instruction. `base.md`'s
  Delegation Tiers section now points to it.
- `CLAUDE.md` marker block is generated dynamically from `templates/managed/*.md`
  — adding a managed file no longer requires CLI changes; `sync` rewrites the
  block so existing projects pick up new imports.
- `moskills init` adds `.claude/settings.local.json` to the project `.gitignore`
  (created if missing, appended idempotently, skipped outside git repos).
- `moskills init --with-hooks` installs the Git pre-commit wrapper (previously
  legacy-script-only); existing hooks are never overwritten.
- Plugin is now the only supported distribution channel; `setupskill.sh` copy
  script documented as deprecated/legacy. Version-consistency test guards
  `VERSION` == `plugin.json` == `marketplace.json` == CHANGELOG entry.
- README rewritten plugin-first: install/update flows, installed-files layout
  (`.claude/standard/`, `.moskills.json`, root `CLAUDE.md` marker block),
  repo map, and uninstall steps now match the v0.5+ managed-layer model.

## 0.5.0

- **New `moskills` CLI** (`init` / `sync` / `doctor` / `version`) replacing raw
  template copying with a versioned, upgradeable standard:
  - Managed layer (`.claude/standard/`, `.claude/commands/`, `.claude/skills/`,
    `agent-guard.sh`) owned by moskills, tracked via sha256 checksums in
    `.claude/standard/.manifest.sum`, overwritten on `sync`.
  - Project layer (root `CLAUDE.md`, `.claude/STATE.md`, `tasks/todo.md`,
    `tasks/lessons.md`, `settings.local.json`) seeded once, never overwritten.
  - `.moskills.json` manifest per repo records installed standard version.
  - Root `CLAUDE.md` links the standard via an `@`-import marker block;
    existing CLAUDE.md files get the block appended, content untouched.
  - `doctor` reports drift (outdated version, hand-edited managed files,
    missing project files); exit 1 on drift. `--all <root>` runs across repos.
  - `sync` keeps hand-edited managed files (warn) unless `--force`;
    `migrations/` scripts run automatically across major versions.
- New managed templates: `base.md` (router + delegation tiers + universal rules
  promoted from portfolio lessons) and `session-protocol.md` (start/end rituals,
  parking protocol). Compact `STATE.md`/`tasks` seeds.
- `VERSION` file introduced; semver policy documented in `migrations/README.md`.
- `setupskill.sh` remains for legacy installs; `moskills init` is now canonical.
- **Plugin meta-commands** (`commands/`, plugin-only, never copied into repos):
  `/moskills-init`, `/moskills-sync`, `/moskills-doctor` run the bundled CLI via
  `${CLAUDE_PLUGIN_ROOT}` — so a plain `/plugin install` delivers the full
  standard with no cloning: install plugin, then `/moskills-init` in any project.

## 0.4.0

- Added `preview` skill and `/preview` slash command.
  Turns a vague idea into a written spec before any code is written.
  Includes a Visual Companion local server (bundled scripts, no external plugin)
  that auto-starts for frontend projects (Angular, React, Vue) and renders
  browser-based mockups during the design dialogue.
  Session resume: if a previous server is alive, it is resumed instead of
  starting fresh. Spec is saved to `docs/specs/YYYY-MM-DD-<topic>.md` and
  committed. After user approval the skill hands off to `/align-intent`.
  Lifecycle updated: New Feature → /preview → /align-intent → /system-map →
  Coding Phase → /gatekeeper → Done.

## 0.3.0

- Added `project-dna` skill and `/project-dna` slash command.
  Tracks every significant implementation decision, configuration, and action
  taken during a co-development session so the exact same work can be
  reproduced in one shot by a fresh agent.
  Each entry follows a structured format: context → decisions → validations →
  steps → configs → outputs → Replay Prompt.
  Triggers manually (`track this`, `DNA this`) and automatically before
  `git commit` or `git push`.

## 0.2.0

- Added Claude Code plugin support via `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`. moskills can now be installed in one line
  and updated centrally: `/plugin marketplace add Mouad1/moskills` then
  `/plugin install moskills@moskills`.
- Commands are now distinct manual triggers; full procedures live only in
  skills, removing the command/skill duplication in the slash menu.
- Standardized skill descriptions to `Use when:` triggers so skills
  auto-invoke based on the request.
- Removed empty `caveman/` and `claude-mem/` skill directories.(postponed)

## 0.1.0

- Added shell installer for copying workflow templates into target projects.
- Added core workflows: `/align-intent`, `/shared-language`, `/system-map`, `/tdd`, `/diagnose`, `/checkpoint`, `/gatekeeper`, `/compress-input`, `/memorize`, and `/handoff`.
- Added optional Git hook guardrails through `--with-hooks`.
