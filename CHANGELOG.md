# Changelog

## 0.3.0

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
