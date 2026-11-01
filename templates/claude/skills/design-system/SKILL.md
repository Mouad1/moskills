---
name: design-system
description: "Use when: a product with a UI needs consistent look and feel: choosing colors, type, spacing, the app shell (navigation, layout), a component list, or the layout and states of a screen; or when UI code drifts from agreed design values."
---

# Design System

Primary goal: Keep one design file (`design.md`) that every screen and component follows, checked by a tool and turned into code values.

`design.md` lives at the project root. `/preview` reads it before mocking up any UI and writes the choices the user picks back into it; this skill owns its structure. There is no second design file.

## Parts (build in this order; each can be its own request)

1. **tokens:** colors (light and dark), type, spacing, radius, motion, as rows in the `## Tokens` table, plus the text/background pairs that must stay readable under `### Contrast pairs` (4.5 for text, 3 for large text and UI boundaries).
2. **shell:** the app frame under `## Shell`: navigation pattern, header, safe areas, breakpoints, where content scrolls.
3. **components:** one row per reusable piece under `## Components`, with every state it needs (`default, pressed, focus, disabled, loading, error` as they apply).
4. **screen:** one `### Screen: <name>` block per screen under `## Screens`, with a `Components:` line (only names from the Components table) and a `States:` line (`empty, loading, error, ready` as they apply), then a short layout description.

## Steps

1. No `design.md` yet: run `moskills design init` (writes a skeleton with starter tokens) or write the same structure by hand.
2. For the part asked for, propose concrete values. When a visual choice matters, show options with the `/preview` Visual Companion (swatches, type scale, shell layouts, component states) and let the user pick. If the user says "you decide", choose and label it `Self-authored under delegation`.
3. Write the choice into `design.md`. Never keep design values only in chat or only in code.
4. Run `moskills design check` and fix every error (bad color values, failing contrast, screens using components that are not declared). Use `--complete` once all parts exist. When a run exists, record it as proof: `run-state wrap --task <id> -- moskills design check --complete`.
5. Turn tokens into code with `moskills design css --out <path>` (for example `src/styles/tokens.css`) and use those variables in components; do not hard-code a value that has a token. For non-CSS stacks, map the same token names in the platform's theme file.
6. When building a screen, read its block first, and cover every listed state.

## Rules

- `design.md` is the source of truth; if code and file disagree, fix the code or update the file with the user's agreement.
- Status is never shown by color alone; every interactive component has a visible focus state.
- Keep it short: values and decisions, not essays. One line of reasoning per non-obvious choice.
- Do not invent brand assets (logos, names, fonts with licences) the user did not provide.
