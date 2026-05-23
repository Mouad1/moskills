---
name: shared-language
description: "Use when: project jargon, domain terms, acronyms, business words, naming, or repeated explanations are unclear between devs, agents, and domain experts."
---

# Shared Language

Primary goal: Build shared language for the project.

## Use When

- Domain experts and developers use different words.
- A project term needs repeated explanation.
- Names in code do not match the business language.
- A short phrase can replace a long explanation.

## Steps

1. Collect words from the user, docs, issues, code, and examples.
2. Ask for clarification when a term has more than one meaning.
3. Write each term with meaning, usage, naming guidance, and example.
4. Prefer the project term in variables, functions, files, tests, and docs.
5. Update `.claude/STATE.md` under `Shared Language`.

## Entry Format

```text
Term:
Meaning:
Use When:
Avoid Saying:
Code Names:
Example:
```

## Rules

- Do not invent domain terms.
- Mark uncertain meanings as unknown.
- Keep definitions short.
- Use the shared language in later intent models, tests, and code names.