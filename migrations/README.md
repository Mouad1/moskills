# Migrations

Scripts run automatically by `moskills sync` when a repo crosses a MAJOR version boundary.

Naming: `v<from-major>-to-v<to-major>.sh` (e.g. `v1-to-v2.sh`). Each script receives the
target repo path as `$1` and must be idempotent (safe to run twice).

Semver policy:
- **patch** (0.5.x): wording/content fixes in managed files — sync silently.
- **minor** (0.x.0): new skill, new managed file or section — sync, no migration needed.
- **major** (x.0.0): layout change (files move/rename) — requires a migration script here.
