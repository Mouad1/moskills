# /memorize

Use skill: memorize

Use this command when project memory should be checked, written, or summarized without filling the current chat.

Use it for durable lessons, recurring project rules, and decisions that future sessions should remember.

Inspired by `thedotmack/claude-mem`, but this local command does not install or invoke that real plugin.

For past-session lookup, use this retrieval flow:

```text
search -> timeline -> get_observations
```

Fetch full observations only after filtering compact search results.