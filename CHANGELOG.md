# Changelog

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
