# Migrations

Scripts run automatically by `moskills sync` when a repo crosses a MAJOR version boundary.

Naming: `v<from-major>-to-v<to-major>.sh` (e.g. `v1-to-v2.sh`). Each script receives the
target repo path as `$1` and must be idempotent (safe to run twice).

Semver policy:
- **patch** (0.5.x): wording/content fixes in managed files — sync silently.
- **minor** (0.x.0): new skill, new managed file or section — sync, no migration needed.
- **major** (x.0.0): layout change (files move/rename) — requires a migration script here.

## Projects set up with the retired `setupskill.sh`

`setupskill.sh` was removed in 0.9.0. It copied a self-contained `.claude/` folder
(including `.claude/CLAUDE.md` and `.claude/STATE.md`) with no `.moskills.json`, so
`sync` and `doctor` do not recognise those projects. To move one over:

1. Run `moskills init --target <project>` (add `--with-hooks` if you used it before).
   Existing files are kept; init adds the managed standard and `.moskills.json`.
2. Copy anything you wrote in `.claude/CLAUDE.md` into the root `CLAUDE.md`
   (`Project constraints` section), then delete `.claude/CLAUDE.md`.
3. Keep `.claude/STATE.md`; add a `## Findings` heading if it has none.
4. Run `moskills doctor --target <project>`; it should report no drift.
