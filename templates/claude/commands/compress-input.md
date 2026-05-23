# /compress-input

Use skill: compress-input

Use this command when agent communication should become short, direct, and low-noise.

Modes: lite, full, ultra, wenyan.

Default mode is `full`.

The agent should keep technical terms exact, remove filler, and make next action clear. Output tokens only. Reasoning stays intact.

Inspired by `JuliusBrussee/caveman`, but this local command does not install or invoke that real plugin.

Related helper workflows:

- `compress-commit`: terse Conventional Commit messages.
- `compress-review`: one-line PR review comments.
- `compress-stats`: summarize estimated token savings when metrics exist.
- `compress-file <file>`: shorten memory or instruction files while preserving code, paths, URLs, and exact technical terms.