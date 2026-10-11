# moskills: install once, ask normally

Status: npm packaging exists in source; public registry publication is pending. Use a local tarball until release.

## Install and use

Requires Node.js 18+ and a POSIX shell on macOS, Linux, or WSL. Use your existing AI agent and account.

After npm publication:

```sh
npm install -g moskills
cd your-project
moskills init
```

Without a global install: run `npx moskills init` in your project after release. Open Claude Code, Codex, or another agent that reads `AGENTS.md` and project skills. Restart an existing session if it already loaded instructions.

Ask normally: “Fix this bug”, “Build this feature”, “Review this change”, or “What is still not done?” Agent selects skills from installed descriptions. Slash commands remain optional; host must support and follow project instructions.

Default responses give outcome, evidence, and blocker/next step briefly. Ask for detail when needed. Installer warnings and errors remain visible; `--verbose` shows full output.

## Try unpublished package locally

From source checkout:

```sh
npm test
npm pack --pack-destination /tmp
npm install -g /tmp/moskills-0.6.5.tgz
```

Then run `moskills init` in your project. Local npx trial:

```sh
npx --yes --package /tmp/moskills-0.6.5.tgz moskills init
```

Package has no third-party npm runtime dependencies or installation lifecycle scripts.

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

After registry release:

```sh
moskills doctor
npm install -g moskills@latest
moskills sync
npm uninstall -g moskills
```

npx users update project copies with `npx moskills sync`. Uninstalling CLI keeps project files. npm owns its executable and updates; global linking, standalone self-update, and launch-agent scheduling are rejected in npm mode.

## Run state and evidence

**Run state** is saved checklist: requested work, finished work, remaining work, and decisions needed. **Evidence** is proof: observed test output, reviewed diff, or actual UI screenshot.

Example: “Add a login form.” Build foundation, then form. Tests pass, screenshot review remains missing:

| Finished | Still not done |
|---|---|
| Form implementation | Visual review |
| Behavior tests with command/result | Human acceptance if required |

Passing tests do not prove appearance. Unavailable required checks stay `unknown`; task stays open. Changes invalidate affected earlier evidence. Required approval applies to reviewed result.

`.claude/STATE.md` and `tasks/todo.md` hold progress and evidence. Agents maintain these files; this release has no enforced run-state service or evidence database.

## Finished and still not done

Local package tests exercise packed global installs, npx cache cleanup, repeated init, upgrade, uninstall, and paths with spaces. An isolated Codex smoke scenario verifies ordinary bug routing after explicit instruction reads; host automatic loading and other agents remain separate checks.

CI configuration runs the same suite on Ubuntu and macOS with Node 18, 22, and 24. CI has not run remotely yet; those platform/version results remain unverified. Configuration follows official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) guidance.

Still not done:

- Human validation, commits, and public npm publication.
- Native Windows support; use WSL.
- Remote CI, live Claude Code, WSL, and broader community/platform trials.
- Enforced run-state engine, interactive progress UI, and evolvebook forms from architecture roadmap.

Documentation must include useful diagrams for workflows, dependencies, or architecture. Keep diagrams close to explained text.
