# Python Project Example

This example shows installing moskills into a project that contains `pyproject.toml`, `requirements.txt`, or `setup.py`.

## Project

```text
my-python-app/
  pyproject.toml
```

## Install

```sh
./setupskill.sh --target /path/to/my-python-app --with-hooks
```

Expected installer output includes:

```text
Detected stack: python
Installed commands:
  /align-intent
  /system-map
  /checkpoint
  /gatekeeper
```

## Guard Suggestion

When the optional Git hook runs in a staged Python project, `agent-guard.sh` prints this validation suggestion:

```text
agent-guard: suggested Python validation: pytest
```

The hook does not run `pytest` for you. It reminds the agent which project check is likely relevant.