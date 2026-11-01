# /design-system

Manual trigger for the `design-system` skill.

Run it to set up or extend the project's one design file, `design.md`: tokens,
app shell, components, or a screen (`/design-system tokens`, `/design-system screen Home`).
`moskills design check` verifies it and `moskills design css` turns its tokens
into CSS variables. The full procedure and rules live in the skill, which also
runs automatically when its `Use when:` triggers match.
