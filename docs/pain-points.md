# Pain Points

moskills maps specific agent failures to small commands with one job each.

| Command | Real pain point | What it gives |
| --- | --- | --- |
| `/shared-language` | People use different words for the same domain idea, so agent output drifts away from how the team thinks and names things. | A shared glossary of terms, meanings, code names, examples, and naming guidance. |
| `/align-intent` | Requirements live in scattered chat messages, so agent starts coding from an incomplete brief. | A clear intent model: goal, constraints, inputs, outputs, success criteria, non-goals, and risks. |
| `/system-map` | Agent edits the wrong layer because it has not seen module boundaries, data flow, owners, or hidden dependencies. | A compact map of files, responsibilities, dependencies, risk areas, and safest change boundary. |
| `/tdd` | Agent writes code that looks plausible but has no fast proof that behavior changed correctly. | A red, green, refactor loop with a focused test before implementation. |
| `/diagnose` | Bugs get patched by guesswork, so symptoms disappear briefly while root cause stays unknown. | Reproduction, evidence, suspected cause, fix plan, and verification kept separate. |
| `/checkpoint` | Long sessions lose the thread: changed files, decisions, commands, blockers, and next steps are scattered across chat. | A factual progress record in `.claude/STATE.md` for the current project session. |
| `/gatekeeper` | Agent says work is done without checking the original intent or showing observed verification output. | A completion gate that separates passing checks, failing checks, unknowns, and remaining risk. |
| `/compress-input` | Agent replies are too verbose, burying the next action and wasting attention during focused work. | Short, direct communication modes while preserving exact technical terms, commands, paths, and errors. |
| `/memorize` | A lesson, user preference, or project decision keeps getting rediscovered instead of reused. | Store the short durable fact in memory, then point current work back to `.claude/STATE.md` when needed. |
| `/handoff` | Another agent or future session needs to continue, but the useful context is mixed into a long transcript. | A compact handoff with goal, decisions, changed files, blockers, verification, and next actions. |
| Optional Git hook | Conflict markers or risky placeholder text reach staged files because final checks were skipped. | `agent-guard.sh` blocks selected staged-file hazards before commit. |

Use the commands together for full lifecycle coverage:

```text
Project Start -> /shared-language
New Feature -> /align-intent -> /system-map -> Coding Phase with /tdd or /diagnose and /checkpoint -> /gatekeeper -> Done
```

Optional hook flow:

```text
git commit -> .git/hooks/pre-commit -> .claude/hooks/agent-guard.sh -> allow or block commit
```