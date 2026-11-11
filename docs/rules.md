# Business rules: moskills

> One rule per row: what moskills must guarantee, how we measure it, and the test that proves it. `docs/prd.md` refers to these IDs. Format guide: `templates/project/docs/rules.md`.

## Rules

| ID | Rule | Expected (measurable) | Proof | State | Source |
| --- | --- | --- | --- | --- | --- |
| MSK-001 | When init runs on a project that already has its own files, moskills shall keep them unchanged. | A seeded file edited by the user is byte-identical after a second init | `tests/prd-rules-templates.test.cjs` "init seeds both files once and keeps edits" | accepted | PRD journey 4 |
| MSK-002 | When a checked file changes after its check passed, run-state shall mark the proof stale and reopen the task. | Task status unfinished, stale true, after one edit | `tests/run-state.test.cjs` test 4 | accepted | PRD goal 2 |
| MSK-003 | The run shall count as done only when every task has current passing proof and the user's acceptance holds. | `run-state done` exits 1 until both hold, 0 after | `tests/modular-build.test.cjs` "done fails until every task has current proof and the user accepted" | accepted | PRD goal 2 |
| MSK-004 | When a scoped file changes after acceptance, run-state shall reset acceptance to pending. | acceptance status pending after one edit | `tests/run-state.test.cjs` test 7 | accepted | PRD goal 2 |
| MSK-005 | When a run exists and a changed file has stale proof, the commit gate shall deny `git commit`, naming the task, the file and the re-run command. | deny JSON with task id, file and `run-state wrap` | `tests/commit-gate.test.cjs` "denies a commit when a changed file made the proof stale" | accepted | PRD goal 1 |
| MSK-006 | If the commit gate cannot read its input, then it shall block the command. | deny JSON and exit 2 on invalid JSON | `tests/commit-gate.test.cjs` "bad input does not fail open" | accepted | PRD constraints |
| MSK-007 | When a task changes a UI file, `run-state done` shall refuse until visual proof covers the file or the user accepts after the change. | done exits 1 naming the file; 0 after `visual-<task>` proof | `tests/visual-gate.test.cjs` "require-visual blocks done until visual proof covers the UI files" | accepted | PRD journey 3 |
| MSK-008 | Where no moskills project is present, the context hook shall print nothing. | empty stdout outside a project | `tests/context-hook.test.cjs` "silent outside a project" | accepted | PRD constraints |
| MSK-009 | When a managed file is deleted, sync shall restore it. | file present again after `moskills sync` | `tests/run-tests.sh` `test_sync_restores_deleted_managed_file` | accepted | PRD journey 4 |
| MSK-010 | While a run declares rules, `run-state done` shall refuse until each rule is accepted and linked to a task with current proof. | done exits 1 listing draft, unknown or unlinked rules | `tests/run-state-rules.test.cjs` "done refuses until every declared rule is accepted and proven by a task" | accepted | PRD journey 1 |

## Proof status

Generated from run-state by `moskills run-state rules`; do not edit between the markers.

<!-- moskills:rules:begin -->
<!-- moskills:rules:end -->
