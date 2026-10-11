# Delegation — Scoped Native Subagents

Managed by moskills. Change this standard in the moskills repo, then run `moskills sync`.

## Decide when to delegate

Use the current platform's native subagent tools for independent research, bounded implementation, or review when they help. Respect platform availability, concurrency limits, and inherited permissions. Do not assume a particular tool name, model, background service, or cross-platform agent bridge exists. If delegation is unavailable or unnecessary, run the same scoped tasks serially and record that choice.

The coordinating agent may implement directly. Delegate responsibility by task, not by model rank. Do not spawn agents for a trivial edit.

## Dispatch contract

Every delegated task includes:

- Goal, acceptance criteria, relevant context, and dependencies already satisfied.
- Owned files or bounded read-only scope; avoid concurrent writes to the same files.
- Allowed actions, verification expected, and explicit exclusions.
- A report with changes/findings, observed evidence, failed or unknown checks, and remaining work.

Subagents can resolve routine implementation choices inside their scope. They stop and report when a blocker, contradictory requirement, scope expansion, permission boundary, or new dependency needs coordination. They must not install dependencies or commit, push, or merge without the user's required validation. The coordinating agent integrates results and verifies the combined behavior.

## Dependency order

Establish shared contracts and foundations before dispatching dependent work. Parallelize only tasks whose prerequisites are satisfied and whose outputs do not conflict. Review the integrated result after dependent work joins.

## Bounded challenger/fixer review

Use review proportionate to scope and risk. For non-trivial work, ask a challenger to test the proposed result against intent, edge cases, and evidence. A fixer addresses concrete findings within the approved scope. Native subagents may take these roles; otherwise perform separate challenger and fixer passes serially and disclose the lack of independent review.

Allow at most **two challenger/fixer passes per task**. After each pass, record findings, fixes, and verification. Do not restart the counter by renaming the task. After two passes, unresolved material findings remain **Still not done**: report evidence, impact, and the decision or next action needed. Escalate to the user only when their decision or authorization is required; otherwise record the blocker and a concrete continuation plan. Never loop until an agent rubber-stamps the work.
