# moskills: install once, ask normally

Status: [moskills 0.8.1 is published on npm](https://www.npmjs.com/package/moskills/v/0.8.1). Registry integrity matches the reviewed artifact; fresh global npm and npx installs passed on 2026-10-13. For a safe, complete trial, follow the [A–Z testing walkthrough](testing-from-a-to-z.md).

## Install and use

Requires Node.js 18+ and a POSIX shell on macOS, Linux, or WSL. Use your existing AI agent and account.

```sh
npm install -g moskills
cd your-project
moskills init
```

Without a global install: run `npx moskills init` in your project. Open Claude Code, Codex, or another agent that reads `AGENTS.md` and project skills. Restart an existing session if it already loaded instructions.

Ask normally: “Fix this bug”, “Build this feature”, “Review this change”, or “What is still not done?” Agent selects skills from installed descriptions. Slash commands remain optional; host must support and follow project instructions.

Default responses give outcome, evidence, and blocker/next step briefly. Ask for detail when needed. Installer warnings and errors remain visible; `--verbose` shows full output.

## Test a source checkout locally

From source checkout:

```sh
npm test
MOSKILLS_PACKAGE=$(npm pack --pack-destination /tmp)
npm install -g "/tmp/$MOSKILLS_PACKAGE"
```

Then run `moskills init` in your project. Local npx trial:

```sh
npx --yes --package "/tmp/$MOSKILLS_PACKAGE" moskills init
```

Package has no third-party npm runtime dependencies or installation lifecycle scripts. It bundles the shell CLI, copied skills/templates, evolvebook helper and guide, public diagram assets, the architecture guide and Obsidian canvas, and both Claude settings helpers in `lib/`.

## Installation flow

```mermaid
flowchart LR
    N[npm or npx] --> C[moskills init]
    C --> A[AGENTS.md and copied skills]
    C --> L[CLAUDE.md and copied standard]
    A --> Q[Ordinary request]
    L --> Q
    Q --> T[Build, test, review]
    T --> S[Saved progress and evidence]
    S --> H[Human acceptance when required]
```

Project copies survive npx cache deletion and npm uninstall. Project-owned notes are seeded once. Repeat init/sync preserve edited managed files unless you explicitly use `--force`; doctor reports drift.

Update, check, or remove the CLI:

```sh
moskills doctor
npm install -g moskills@latest
moskills sync
npm uninstall -g moskills
```

npx users update project copies with `npx moskills sync`. Uninstalling CLI keeps project files. npm owns its executable and updates; global linking, standalone self-update, and launch-agent scheduling are rejected in npm mode.

## Evolvebooks and Claude plugin updates

Evolvebook creation, repeat checks, project links, and export work in the npm package. For project-only books:

```sh
moskills evolvebook setup --project-only
moskills evolvebook new release-guide --project --purpose "Release guide" --use-when "shipping code" --choices "topic,format"
moskills evolvebook repeat release-guide topic=runtime format=guide
moskills evolvebook link
moskills evolvebook export release-guide --out release-guide.md
```

`evolvebooks` is an alias of `evolvebook`; helper arguments and help pass through. Project-only setup saves the mode in the user's evolvebooks configuration, then books stay under the project `.evolvebooks/`. Project links point to those durable book copies. Read the [evolvebook guide](evolvebook.md) for other homes and the agent workflow.

`moskills plugin-autoupdate --check` reports Claude Code marketplace settings without rewriting them. `moskills plugin-autoupdate` enables that marketplace's automatic updates while preserving other settings. Those commands manage the Claude plugin; update the npm CLI through npm, then sync project copies. npm notices recommend `npm update -g moskills` and `moskills sync`.

## Run state and evidence

**Run state** is saved checklist: requested work, finished work, remaining work, and decisions needed. **Evidence** is proof: observed test output, reviewed diff, or actual UI screenshot.

Example: “Add a login form.” Build foundation, then form. Tests pass, screenshot review remains missing:

| Finished | Still not done |
|---|---|
| Form implementation | Visual review |
| Behavior tests with command/result | Human acceptance if required |

Passing tests do not prove appearance. Unavailable required checks stay `unknown`; task stays open. Changes invalidate affected earlier evidence. Required approval applies to reviewed result.

`.claude/STATE.md` and `tasks/todo.md` hold progress notes. From 0.9.0, `moskills run-state` keeps the proof: when a run exists, task and gate status come from it, and a generated **Run proof** block in `.claude/STATE.md` mirrors it.

## Finished and still not done

Local package tests exercise packed global installs, npx cache cleanup, repeated init, dynamically newer upgrades, uninstall, paths with spaces, evolvebook setup/new/repeat/link/export, helper help, bundled assets, and read-only plugin update checks. The integrated suite includes upstream evolvebook and automatic-update regressions plus project safety checks. Local verification uses macOS with Node 26.5.0 and npm 11.17.0; other platform/version results require their own runs. An isolated Codex smoke scenario verifies ordinary bug routing after explicit instruction reads; host automatic loading and other agents remain separate checks.

CI configuration runs the same suite on Ubuntu and macOS with Node 18, 22, and 24. All six jobs passed for the 0.8.1 release in [PR #22 CI](https://github.com/Mouad1/moskills/actions/runs/38379523977). These results cover package behavior; live agent and WSL trials remain separate checks. Configuration follows official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) guidance.

Still not done:

- Native Windows support; use WSL.
- Live Claude Code, WSL, automatic instruction loading, and broader community/platform trials.
- Publish 0.9.0 (run-state engine, skills that use it, `moskills dashboard`) to npm; 0.8.1 does not include them.
- Evolvebook UI forms. Plain Markdown evolvebook creation and export already work.

Documentation must include useful diagrams for workflows, dependencies, or architecture. Keep diagrams close to explained text.
