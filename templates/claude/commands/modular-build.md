# /modular-build

Manual trigger for the `modular-build` skill.

Run it to build an app or large feature one module at a time: each module is a
run that must be proven by `/gatekeeper` and accepted by you before the next one
starts. The full procedure and rules live in the skill, which also runs
automatically when its `Use when:` triggers match.
