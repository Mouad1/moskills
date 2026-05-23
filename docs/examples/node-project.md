# Node Project Example

This example shows installing moskills into a project that contains `package.json`.

## Project

```text
my-node-app/
  package.json
```

## Install

```sh
./setupskill.sh --target /path/to/my-node-app --with-hooks
```

Expected installer output includes:

```text
Detected stack: node
Installed commands:
  /align-intent
  /system-map
  /checkpoint
  /gatekeeper
```

## Guard Suggestion

When the optional Git hook runs in a staged Node project, `agent-guard.sh` prints this validation suggestion:

```text
agent-guard: suggested Node validation: npm test
```

The hook does not run `npm test` for you. It reminds the agent which project check is likely relevant.