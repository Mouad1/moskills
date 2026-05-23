---
name: compress-input
description: "Use when: user asks for compressed communication, lite/full/ultra/wenyan brevity, short answers, low-noise updates, terse commits, terse PR review comments, or direct technical communication."
---

# Compress Input

Primary goal: Keep agent communication short and direct.

Inspired by `JuliusBrussee/caveman`.

This skill does not install the real Caveman plugin, hooks, statusline, MCP middleware, or companion commands. It gives the local agent the core communication rules under a neutral command name.

## Modes

Available modes: lite, full, ultra, wenyan.

- `lite`: remove filler and keep normal grammar.
- `full`: default mode. Short, direct, fragment-friendly.
- `ultra`: telegraphic. Use only when the user wants maximum compression.
- `wenyan`: classical Chinese style. Use only when the user explicitly asks for it.

Default to `full` when the user says `/compress-input` without a mode.

## Core Principle

Output tokens only. Reasoning stays intact.

The point is smaller replies, not smaller thinking. Keep the work correct. Compress the explanation.

## Trigger And Stop

- Start when the user says `/compress-input`, `/compress-input lite`, `/compress-input full`, `/compress-input ultra`, `/compress-input wenyan`, or asks for compressed communication.
- Stop when the user says `normal mode`, `stop compress-input`, or asks for full detail.
- Switch to normal detail for security warnings, irreversible actions, legal risk, user confusion, or complex tradeoffs.

## Rules

- Drop filler.
- Drop greetings and repeated reassurance.
- Keep technical terms exact.
- Prefer short sentences and fragments when clear.
- Say current state, reason, and next action.
- Preserve code, commands, paths, URLs, identifiers, and error text exactly.
- Do not hide risks or failures to save words.
- Do not compress user-facing product copy unless asked.

## Pattern

```text
Thing. State. Reason. Next action.
```

## Helper Workflows

- `compress-commit`: write Conventional Commit messages with a short subject. Prefer why over what.
- `compress-review`: write one-line PR comments with location, severity, issue, and fix.
- `compress-stats`: summarize estimated communication savings when session metrics exist.
- `compress-file <file>`: rewrite memory or instruction files in shorter language while preserving code, paths, URLs, and exact technical terms.

## Examples

Normal:

```text
The component re-renders because the inline object prop creates a new reference every render. Use memoization for the object.
```

Compressed:

```text
Inline object prop. New ref each render. Re-render. Use memoization.
```

Review comment:

```text
L42: bug: user can be null. Add guard.
```