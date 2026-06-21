# Agentic Skill Plugin Design

## Objective

Create a standardized GitHub repository that works as a portable plugin store for agentic development workflows. Users install the workflow pack into any project with `setupskill.sh`. After installation, they can use slash commands and reusable skills to align intent, map systems, record checkpoints, and validate work before calling it done.

The first release is shell-only. It does not publish an npm package or install runtime dependencies.

## Target User

The target user is a developer who wants AI agents to work with more discipline inside existing projects. They need clear commands, simple language, durable context, and validation steps that reduce skipped requirements, hallucinated progress, and unsafe edits.

## Core Principles

- Single responsibility: each command and skill handles one job.
- Agnostic components: instructions push agents toward modular, plug-and-play code that is decoupled from business-specific logic.
- Simple language: wording should be clear for non-native English speakers and efficient for AI agents.
- Progressive disclosure: `CLAUDE.md` routes agents to the right command or skill only when needed.
- Safe installation: installer avoids overwriting user files unless the user passes `--force`.
- No forced dependencies: v1 does not install Husky, lint-staged, npm packages, or Python packages automatically.

## First Release Scope

The repository will ship these user-facing workflows:

- `/align-intent`: confirm agreement before coding.
- `/system-map`: visualize module relationships at system or module level.
- `/checkpoint`: record audit trail and current state.
- `/gatekeeper`: validate behavior against the agreed model before completion.

The repository will also ship matching skill folders for automatic agent routing:

- `align-intent`
- `system-map`
- `checkpoint`
- `gatekeeper`

The installer copies both command files and skill files into the target project.

## Out Of Scope For V1

- Publishing to npm.
- Automatic dependency installation.
- Automatic modification of package scripts.
- Full graphical web UI.
- Agent marketplace backend.
- Project-specific business rules.
- Database schema changes.

## Repository Structure

```text
moskills/
  setupskill.sh
  README.md
  CHANGELOG.md
  LICENSE
  templates/
    claude/
      CLAUDE.md
      STATE.md
      commands/
        align-intent.md
        system-map.md
        checkpoint.md
        gatekeeper.md
      skills/
        align-intent/
          SKILL.md
        system-map/
          SKILL.md
        checkpoint/
          SKILL.md
        gatekeeper/
          SKILL.md
      hooks/
        pre-commit
        agent-guard.sh
  docs/
    lifecycle.md
    command-reference.md
    pain-points.md
    examples/
      node-project.md
      python-project.md
```

## Installed Project Structure

After `setupskill.sh` runs, a target project should contain:

```text
.claude/
  CLAUDE.md
  STATE.md
  commands/
    align-intent.md
    system-map.md
    checkpoint.md
    gatekeeper.md
  skills/
    align-intent/
      SKILL.md
    system-map/
      SKILL.md
    checkpoint/
      SKILL.md
    gatekeeper/
      SKILL.md
  hooks/
    pre-commit
    agent-guard.sh
```

## Lifecycle

```text
New Feature -> /align-intent -> /system-map -> Coding Phase with /checkpoint -> /gatekeeper -> Done
```

`/align-intent` is the default first step before coding. `/system-map` is used when architecture or module relationships matter. `/checkpoint` is used during work and before context becomes stale. `/gatekeeper` is used before reporting completion.

## Command And Skill Design

### /align-intent

Purpose: prevent coding before agreement.

Rules:

- Ask no more than five targeted questions.
- Prefer multiple-choice questions when practical.
- Stop when the implementation goal, constraints, and success criteria are clear.
- Produce a logic model before coding.

Logic model format:

```text
Input:
Action:
Output:
Success:
Non-goals:
Risks:
```

Pain points covered:

- Agent starts too soon.
- User intent is assumed instead of confirmed.
- Requirements are scattered across chat.

### /system-map

Purpose: show how modules relate before changing code.

Modes:

- Zoom-Out: system-level relationships between major modules.
- Zoom-In: one module, its inputs, outputs, dependencies, owners, and risks.

Output format:

```text
View:
Scope:
Modules:
Data Flow:
External Dependencies:
Risk Areas:
Recommended Change Boundary:
```

Pain points covered:

- Agent changes the wrong layer.
- Hidden dependencies are missed.
- User cannot see impact of proposed edits.

### /checkpoint

Purpose: create an audit trail that survives context loss.

Rules:

- Read current Git status and summarize deltas.
- Record internal state in `.claude/STATE.md`.
- Use short, factual entries.
- Never claim tests passed unless command output was observed.

Checkpoint format:

```text
Date:
Working:
Current:
Blocker:
Git Delta:
Commands Run:
Next:
```

Pain points covered:

- Agent forgets why files changed.
- Long sessions lose context.
- User cannot audit progress.

### /gatekeeper

Purpose: validate work before completion.

Rules:

- Find relevant test references from the project.
- Detect available linters and test commands.
- Run checks when available and safe.
- Compare result against the `/align-intent` logic model.
- Report pass, fail, and unknown separately.

Validation report format:

```text
Intent Model Checked:
Commands Run:
Passing:
Failing:
Unknown:
Regression Risk:
Final Decision:
```

Pain points covered:

- Agent says done without proof.
- Tests are skipped.
- Success criteria are not checked against original intent.

## Installer Behavior

`setupskill.sh` should run from the repository root or through a downloaded script. It copies templates into the current working project by default.

Required flags:

```text
--target <path>   Install into a specific project path.
--force           Overwrite existing managed files.
--dry-run         Print planned actions without writing files.
--with-hooks      Install Git hook files when possible.
--help            Show usage.
```

Detection behavior:

- Node project: `package.json` exists.
- Python project: `pyproject.toml`, `requirements.txt`, or `setup.py` exists.
- Git project: `.git` exists or `git rev-parse --is-inside-work-tree` succeeds.
- Generic project: no known stack marker exists.

Install behavior:

- Create `.claude/` if missing.
- Copy `CLAUDE.md`, `STATE.md`, commands, skills, and hooks from `templates/claude/`.
- Preserve existing `.claude/STATE.md` unless `--force` is passed.
- Refuse to overwrite existing command or skill files unless `--force` is passed.
- Print installed command names after success.

Hook behavior:

- If `--with-hooks` is passed and project is a Git repo, copy `templates/claude/hooks/pre-commit` into `.git/hooks/pre-commit` only when safe.
- If `.git/hooks/pre-commit` already exists, write a warning and leave it unchanged unless `--force` is passed.
- Copy `agent-guard.sh` into `.claude/hooks/agent-guard.sh`.

## Guardrail Behavior

`agent-guard.sh` should be a small POSIX shell script with reusable checks.

V1 checks:

- Block unresolved Git conflict markers.
- Block placeholder phrases in staged files: `TODO: implement later`, `TBD`, `fake test`, `tests passed without running`.
- Warn when staged changes exist but `.claude/STATE.md` has no checkpoint entry.
- Detect Node or Python test commands and print suggested validation commands.

The guard does not install Husky or lint-staged in v1. Documentation can show optional integration for teams that already use those tools.

## Persistence Model

`.claude/STATE.md` stores durable context outside the token window.

Required sections:

```text
# Agent State

## Current Intent Model

## Active System Map

## Checkpoints

## Open Blockers

## Validation History
```

Commands update this file in narrow ways:

- `/align-intent` updates `Current Intent Model`.
- `/system-map` updates `Active System Map`.
- `/checkpoint` appends to `Checkpoints`.
- `/gatekeeper` appends to `Validation History`.

## Documentation Plan

`README.md` should explain:

- What the project is.
- Who it helps.
- Installation with `setupskill.sh`.
- The command lifecycle.
- What files are installed.
- How to uninstall by removing `.claude/` files.

`docs/command-reference.md` should document each command with purpose, when to use it, output format, and example.

`docs/lifecycle.md` should explain the full flow from new feature to done.

`docs/pain-points.md` should map common agent failures to the command that prevents them.

`docs/examples/node-project.md` and `docs/examples/python-project.md` should show expected installation and validation behavior in common stacks.

## Testing Strategy

The installer should be tested with shell-based smoke tests.

Minimum test scenarios:

- Fresh generic project installs `.claude/` files.
- Existing files are not overwritten without `--force`.
- `--dry-run` prints actions and writes nothing.
- Node project is detected from `package.json`.
- Python project is detected from `pyproject.toml`.
- Git hook installation is skipped unless `--with-hooks` is passed.
- Existing `.git/hooks/pre-commit` is not overwritten without `--force`.

The command and skill files should be checked with simple text assertions:

- Each required command exists.
- Each required skill exists.
- Each skill states one primary goal.
- Each command points to the matching skill.

## Risks And Mitigations

Risk: slash command behavior differs by AI tool.
Mitigation: install both commands and skills, and keep `CLAUDE.md` as router.

Risk: installer overwrites user configuration.
Mitigation: no overwrite by default, `--force` required.

Risk: hooks break existing teams.
Mitigation: hooks install only with `--with-hooks`, existing hooks are preserved by default.

Risk: instructions become too verbose.
Mitigation: keep commands thin, put deeper behavior in matching skills, and route from `CLAUDE.md`.

Risk: validation claims are inaccurate.
Mitigation: `/gatekeeper` must separate observed passing checks from unknown checks.

## Success Criteria

V1 is successful when:

- A user can clone the repository and run `./setupskill.sh --target /path/to/project`.
- The target project receives `.claude/commands` and `.claude/skills` files.
- The installed commands explain when to use each workflow and what output they produce.
- `.claude/STATE.md` exists and supports persistent agent context.
- Hook installation is optional and safe by default.
- Documentation covers installation, lifecycle, command reference, pain points, and examples.
- Tests prove the installer does not overwrite existing files unless `--force` is used.