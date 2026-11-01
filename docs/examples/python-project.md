# Python Project Example

This example shows installing moskills into a project that contains `pyproject.toml`, `requirements.txt`, or `setup.py`.

## Project

```text
my-python-app/
  pyproject.toml
```

## Install

```sh
moskills init --target /path/to/my-python-app --with-hooks
```

Expected output includes:

```text
Installing moskills standard v0.9.0 into /path/to/my-python-app
Seeded: CLAUDE.md
Seeded: .claude/STATE.md
Installed Git pre-commit hook: ...
```

## Guard Suggestion

When the optional Git hook runs in a staged Python project, `agent-guard.sh` prints this validation suggestion:

```text
agent-guard: suggested Python validation: pytest
```

The hook does not run `pytest` for you. It reminds the agent which project check is likely relevant.