---
name: council-loop
description: "Iterative multi-model review loop across different AI providers that convenes a council of delegate models, collects structured findings, fixes issues minimally, and loops until all reviewers agree on correctness. Use when the user says \"council\", \"council loop\", \"council-loop\", \"multi-model review\", \"review loop\", \"loop until agree\", or asks for consensus code review from multiple providers, even if they do not say council-loop."
---

# Council Loop

Primary goal: A code change leaves the loop with every reviewer approving, or with the open disagreement escalated to the user.

## Flow

```text
Scope & Baseline -> Convene Council (Parallel Dispatch) -> Triage Findings & Run Checks -> Loop Delta Until Agreement -> Consensus Report
```

## Budget

- **Default budget**: 3 rounds maximum. Round 1 reviews the full change diff. Subsequent rounds review only the delta diff and open findings.
- **Extended budget**: Up to 5 rounds only for critical security, permissions/auth, data loss, or tricky concurrency/state edge cases where a blocker or should remains open with concrete evidence.
- **Early exit**: Stop immediately once all delegates return `VERDICT: APPROVE` (or score 9+/10 with zero open blockers/shoulds). A round returning only nits or stylistic comments ends the loop without a new round.
- **Deadlock escalation**: If an issue remains disputed after two rounds of replies or if the budget expires, summarize both positions in 2-3 lines and escalate to the human user for a tie-break decision.

## 1. Scope & Baseline

1. Run `git status --short`. Verify working directory state. Do not include unrelated or unstaged files from other work.
2. Determine the merge base:
   - For an existing PR: `gh pr view <pr> --json baseRefName,headRefOid`. Confirm `HEAD` matches or is cleanly ahead. Base: `git merge-base HEAD origin/<baseRefName>`.
   - For local branch: `git merge-base HEAD origin/<default-branch>`. If no remote exists, use default branch or `HEAD` for uncommitted changes.
3. Formulate the intent and out-of-scope guardrails in 1-2 concise sentences.
4. Run covering checks and tests (`run-state wrap` or project test command). Ensure existing tests pass before convening the council; never ask delegates to review code broken by syntax or failing pre-checks.

## 2. Convene the Council

Bring in three reviewer delegates from three distinct AI model providers at high reasoning effort (unless the user names the council models). Pick each provider's strongest reasoning model from what the platform reports at run time; never hard-code model names.

- **In T3 Code**:
  1. Call `orchestrator_capabilities` once to discover available providers and models.
  2. Dispatch delegates in parallel using `delegate_task` (`role: "review"`, `mode: "async"`). Keep the `taskId` and assign a unique `clientRequestId` per delegate per round. Wait for completion events instead of polling `task_status` or sleeping.
- **In Claude Code, Codex, Antigravity and other CLIs**: a native subagent runs only the host's own provider. Use one native subagent for the host provider. Reach each other provider through its own CLI, run non-interactively in read-only mode as a background shell command (check availability with `command -v <cli>`, and its `--help` for the read-only or sandbox flag before the first run). Keep each delegate's ID or session for follow-up rounds.
- **Missing providers**: if fewer than 3 distinct providers are reachable, run the council with the ones that are, name the missing ones to the user, and record `Providers: <N> of 3` in the report. Never count two delegates on the same provider as different providers.
- **Constraints**:
  - Delegates are strictly read-only reviewers. They must NOT edit files, commit, push, create PR comments, or launch subagents.
  - Do NOT edit files while delegates are concurrently reviewing the same checkout.

## 3. Review Brief (Round 1)

Provide each council delegate with this explicit brief:

```text
Review only. Do not edit files, commit, push, comment on PRs, or start subagents.
Repo: <absolute_path>
Base commit: <base_sha>
Diff command: git diff <base_sha> [-- <scoped_paths>]
Intent: <intent_summary>
Out of scope: <out_of_scope_summary>
Pre-check status: <checks_output_summary>

Instructions:
1. Inspect git diff <base_sha> and git status --short for untracked files.
2. Read surrounding code to understand context, callers, and invariants.
3. Identify real bugs, logic errors, regressions, broken callers, and mismatches with intent.
4. Ignore style, formatting, or cosmetic naming unless it conceals a defect.
5. Flag unnecessary complexity, unused helpers, or guards not required by intent.
6. Severity definitions:
   - blocker: Intended behavior broken, regression, security or data loss vulnerability.
   - should: Real bug or edge case callers will hit in production within intent scope.
   - nit: Style preference, speculative future-proofing, or low-impact polish outside core intent.

Reply format:
VERDICT: APPROVE or CHANGES
SCORE: <N>/10
FINDINGS:
- [D<index>-<id>] [blocker|should|nit] <file>:<line>: <claim>. Fix: <recommendation>
(If no findings, state: "FINDINGS: None")
```

## 4. Council Chair Arbitration & Anti-Scope-Creep Triage

When delegate responses arrive, the driving agent acts as the Council Chair:

1. **Check findings independently**: Verify each claim against the code and test suite. Do not assume a claim is correct just because a model flagged it.
2. **Triage into action categories**:
   - **Agree**: Make the smallest, cleanest fix possible. Prefer simplifying or deleting code over adding new abstractions, parameters, or wrappers. Add a focused regression test if required.
   - **Disagree**: If a finding is incorrect or based on a false assumption, refute it with concrete evidence (file:line, test output, or specification).
   - **Decline / Nit / Out of Scope**: Decline in one sentence. Do NOT let reviewers expand scope into refactoring untouched modules.
3. **Arbitrate conflicting advice**: If Delegate A recommends adding an abstraction and Delegate B recommends keeping it flat, choose the simpler, less invasive option that satisfies the intent and passes tests.
4. **Re-verify**: Run the project's tests and checks after applying fixes before starting another round.

## 5. Next Round & Loop Convergence

Start a subsequent round only if:
- Budget remains (rounds < 3, or < 5 for critical exceptions), AND
- At least one delegate returned `CHANGES` with an open `blocker` or `should`, or fixes modified behavioral logic.

For Round 2+:
- Send each delegate who requested changes (or the whole council if behavioral diff changed):
  - The delta diff since the previous round (`git diff <previous_head> HEAD`).
  - The Finding Ledger updating their specific findings:
    - `[D<index>-<id>] RESOLVED: <brief explanation of fix>`
    - `[D<index>-<id>] DISAGREED: <evidence/reason>`
    - `[D<index>-<id>] DECLINED (NIT/OUT OF SCOPE): <reason>`
  - Instructions to review ONLY the delta diff and re-evaluate their open findings.
- **Termination conditions**:
  - **Consensus reached**: All delegates approve, or all blockers/shoulds are resolved and remaining items are declined nits.
  - **Deadlock / Budget reached**: Escalate to the human user with a balanced 2-3 line summary of each perspective.

## 6. Council Review Ledger & Report

Record the council review outcome. If a PR is open, update the PR description with this table above the model/harness signature; otherwise, record it in `.claude/STATE.md` under `Validation History` and in the final summary:

```markdown
## Council review

Rounds: 2
Providers: 3 of 3
Status: Consensus Reached

| Delegate | Provider | Model | Round 1 | Round 2 | Final Verdict |
| --- | --- | --- | --- | --- | --- |
| Delegate 1 | Anthropic | <model id as reported> | 7/10 (CHANGES) | 9/10 (APPROVE) | Approved |
| Delegate 2 | OpenAI | <model id as reported> | 8/10 (CHANGES) | 10/10 (APPROVE) | Approved |
| Delegate 3 | Google | <model id as reported> | 7/10 (CHANGES) | 9/10 (APPROVE) | Approved |

### Findings Ledger
- [D1-1] [blocker] auth.ts:42 Session expiry unhandled -> Resolved: added expiry check.
- [D2-1] [should] cache.ts:15 Key collision on null -> Resolved: sanitized key generation.
- [D3-1] [nit] utils.ts:88 Suggests extra helper -> Declined: out of scope, inline code is clear.
```

## Rules

- **Minimal diffs**: Keep changes strictly minimal to satisfy valid findings. Fight aggressively against scope creep.
- **Truthful scoring**: Record exact scores and verdicts returned by delegates. If a delegate gives no numeric score, write `no score`. Never invent scores.
- **No rubber-stamping**: Do not agree with incorrect feedback just to end the loop. Disagree with evidence.
- **Read-only reviewers**: Council delegates must never write files, commit, or create subagents.
- **Truthful council**: Report the providers that actually reviewed. A council with fewer than 3 providers is labelled as such, never presented as full.
- **Verify before dispatch**: Never send unverified or failing code to the council. Run checks first.
