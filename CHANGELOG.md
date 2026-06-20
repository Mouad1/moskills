# Changelog

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
