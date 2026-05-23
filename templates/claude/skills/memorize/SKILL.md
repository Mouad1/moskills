---
name: memorize
description: "Use when: checking past sessions, searching durable memory, recording lessons, project rules, recurring decisions, observations, summaries, or context that should survive chat limits."
---

# Memorize

Primary goal: Use durable memory without polluting the chat.

Inspired by `thedotmack/claude-mem`.

This skill does not install the real Claude-Mem plugin. If the project needs the actual worker, hooks, MCP tools, and web viewer, install Claude-Mem with its official installer or plugin command.

## Use When

- The user asks what happened before.
- The user asks whether a problem was fixed in a past session.
- The agent needs project history before making a decision.
- A lesson should survive this session.
- A project rule keeps coming up.
- A decision should be available to future agents.
- The chat is getting long and important context should move to durable memory.

## Steps

1. Check whether Claude-Mem or another memory system is available.
2. Search memory before writing new memory.
3. Use the 3-Layer Workflow for past-session lookup.
4. Keep entries short and factual.
5. Store project-specific facts in project memory when available.
6. Store general user preferences in user memory when available.
7. Update or remove memory when it becomes wrong.

## 3-Layer Workflow

Use this order for token-efficient memory retrieval:

```text
search -> timeline -> get_observations
```

1. `search`: get compact results with IDs.
2. `timeline`: get surrounding chronological context for promising IDs.
3. `get_observations`: fetch full details only for filtered IDs.

Do not call `get_observations` first. It is expensive and should be used only after filtering.

## What To Store

- Stable project rules.
- Repeated user preferences.
- Decisions that affect future work.
- Lessons from bugs, failed approaches, and reviews.
- Short summaries of important completed work.

## What Not To Store

- Secrets, tokens, credentials, or private keys.
- Long transcripts.
- Temporary thoughts that will not matter later.
- Duplicate entries already present in memory.

## Privacy

- Treat memory as durable.
- Do not store sensitive content.
- If the real Claude-Mem plugin is available, respect its privacy controls such as `<private>` tags when the user uses them.

## Official Install Notes

- `npx claude-mem install` sets up the plugin path for Claude Code.
- `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem` installs from the Claude Code plugin marketplace.
- `npm install -g claude-mem` installs the SDK/library only and does not register hooks or start the worker.
- The real plugin can expose a worker and web viewer on `http://localhost:37777` when running.

## Rules

- Do not store secrets.
- Do not store long transcripts.
- Do not duplicate existing memory.
- Prefer brief bullets over prose.
- Prefer progressive disclosure over dumping full memory into chat.
- Separate facts from guesses.