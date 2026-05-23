# Pain Points

moskills maps common agent failures to small commands with one job each.

| Pain point | Command | Result |
| --- | --- | --- |
| Agent starts coding before requirements are clear. | `/align-intent` | Shared intent model before edits. |
| User intent is assumed from partial chat context. | `/align-intent` | Inputs, action, output, success, non-goals, and risks are explicit. |
| Project jargon is unclear between devs and domain experts. | `/shared-language` | Terms, meanings, code names, and examples are written once. |
| Code names drift away from business language. | `/shared-language` | Variables, functions, tests, and docs can reuse project terms. |
| Agent changes the wrong layer or too many files. | `/system-map` | Change boundary is visible before implementation. |
| Hidden dependencies are missed. | `/system-map` | Modules, data flow, and external dependencies are named. |
| Agent produces code without runtime feedback. | `/tdd` | A red, green, refactor loop gives fast evidence. |
| Bugs are patched before root cause is known. | `/diagnose` | Reproduction, evidence, cause, fix, and verification are separated. |
| Long sessions lose track of why files changed. | `/checkpoint` | Factual progress and Git deltas are recorded. |
| Context handoff loses current blockers or next steps. | `/checkpoint` | Blockers and next action are written into `.claude/STATE.md`. |
| Agent says tests passed without proof. | `/gatekeeper` | Completion requires observed command output. |
| Success criteria are not checked against original intent. | `/gatekeeper` | Passing, failing, and unknown checks are separated. |
| Agent updates are too noisy. | `/compress-input` | Communication becomes short, direct, and action-focused. |
| Lessons get lost between sessions. | `/memorize` | Durable memory stores short project rules and lessons. |
| Another agent needs to continue the work. | `/handoff` | Goal, decisions, changed files, blockers, and next steps are compacted. |
| Risky placeholder text reaches commits. | Optional Git hook | `agent-guard.sh` blocks conflict markers and selected placeholder phrases in staged files. |

Use the commands together for full lifecycle coverage:

```text
Project Start -> /shared-language
New Feature -> /align-intent -> /system-map -> Coding Phase with /tdd or /diagnose and /checkpoint -> /gatekeeper -> Done
```

Optional hook flow:

```text
git commit -> .git/hooks/pre-commit -> .claude/hooks/agent-guard.sh -> allow or block commit
```