# Product requirements: moskills

> One page: why moskills exists, for whom, and how we know it works. Business rules live in `docs/rules.md` (MSK-001...). Details: `docs/architecture.md`, `docs/roadmap.md`, `docs/pain-points.md`.

## Problem

- Coding agents skip steps: they start coding from a half-understood request, claim "done" without observed proof, lose the thread across sessions, and let another skill pack drive the whole flow.
- Evidence: the 2026-11-01 test-insta-mobile recordings. `/preview` never ran; STATE.md, todo.md and lessons.md stayed empty; no run-state run; 7 finished tasks sat uncommitted; no pre-commit guard was installed.

## Users

- Primary: a developer working with Claude Code on real projects, who wants to describe work in plain language and trust that "done" means proven and approved.
- Secondary: other agents (Codex, Antigravity) reading the same skills, and a future session picking the work up.

## Goals

| Goal | Measurable target | How we measure |
| --- | --- | --- |
| No unproven commit | 0 commits accepted while a changed file has stale proof in a run | commit gate tests (MSK-005, MSK-006) |
| "Done" means proven and accepted | `run-state done` exits 0 only with current proof, acceptance, visual proof for UI tasks, and proven rules | MSK-003, MSK-004, MSK-007, MSK-010 |
| Resumable work | every non-trivial session leaves agreed scope and next step in STATE.md / todo.md | behaviour run in a scratch project |
| Flow stays with moskills | with superpowers installed, each stage gate still runs | behaviour runs A (with superpowers) and B (without) |

## Non-goals

- Not a CI service or network service; leases and proof are local files.
- Hashes detect drift, not tampering; no signatures.
- No runtime dependencies; no hosted dashboard.

## Core journeys

1. Idea → `/preview` (PRD, spec, draft rules) → user approves → plan → `run-state init --rules` (MSK-010).
2. Build a task → check through `run-state wrap` → commit proposed; commit refused if proof is stale (MSK-002, MSK-005).
3. UI edit → visual proof or user look (MSK-007) → `/gatekeeper` → `run-state accept` → `run-state done` (MSK-003).
4. Install or upgrade: `moskills init` / `sync` never overwrite project-owned files and restore managed ones (MSK-001, MSK-009).

## Constraints

- POSIX sh CLI plus Node (no npm dependencies); runs on macOS, Linux and Windows (Git Bash or cmd fallback).
- Delivered as a Claude Code plugin and as an npm package; hooks only reach plugin installs.
- The user validates every commit, push and merge.

## Open questions

- [NEEDS CLARIFICATION: should the commit and visual gates reach npm-only installs, through project hooks in `.claude/settings.json`?]

## Change log

| Date | Change | Why | Rules touched |
| --- | --- | --- | --- |
| 2026-11-05 | Created | PRD and rules register shipped in 0.9.0; moskills uses them on itself | MSK-001 to MSK-010 |
