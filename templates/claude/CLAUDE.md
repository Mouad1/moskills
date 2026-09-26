# Agent Workflow Router

Use this router to keep agent work deliberate, modular, easy to audit, and easy to hand off.

## Lifecycle

Project Start -> /shared-language

New Feature -> /preview -> /align-intent -> /system-map -> Coding Phase with /tdd or /diagnose and /checkpoint -> /gatekeeper -> /project-dna -> Done

After any correction or found root cause -> /learn

If the session must stop before done, use `/handoff`.

## Commands

- Use `/preview` to turn a vague idea into a written spec before any code.
- Use `/shared-language` when project terms, domain words, acronyms, or repeated explanations are unclear.
- Use `/align-intent` before coding when intent, scope, inputs, outputs, or success criteria are not fully agreed.
- Use `/system-map` when a task touches multiple files, modules, data flows, or boundaries.
- Use `/tdd` when building or changing behavior that can be protected by tests.
- Use `/diagnose` when a bug, failing test, or unexpected behavior appears.
- Use `/checkpoint` during long work, before context changes, and after meaningful file changes.
- Use `/gatekeeper` before saying work is complete.
- Use `/compress-input` when communication should be short, direct, and low-noise.
- Use `/memorize` when durable memory should be checked or updated.
- Use `/project-dna` after building something significant, and before commit or push.
- Use `/learn` after a correction, a rejected review, or a confirmed root cause.
- Use `/handoff` when another agent may need to continue the work.
- Use `/evolvebook` to create, use, list, link or export evolvebooks: guides for one kind of job that improve every run.

## Rules

- Keep code modular and decoupled from business-specific logic.
- Prefer small files with one clear responsibility.
- Do not claim tests passed unless command output was observed.
- Do not push directly to the default branch. Push a branch and open a pull request.
- Update `.claude/STATE.md` when a command changes durable project context.
- Name variables, functions, files, and modules with the shared project language when it exists.

## Hooks

Hooks are optional. They are installed only when `setupskill.sh --with-hooks` is used.

Flow:

```text
git commit -> .git/hooks/pre-commit -> .claude/hooks/agent-guard.sh -> allow or block commit
```

The guard checks staged files for conflict markers and selected risky placeholder phrases. It also prints suggested validation commands for Node and Python projects.