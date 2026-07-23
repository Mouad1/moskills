# Changelog

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
