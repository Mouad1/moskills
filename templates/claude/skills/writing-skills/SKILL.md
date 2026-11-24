---
name: writing-skills
description: "Writes or changes a skill with Test-Driven Development and proves it: records the baseline failure, drafts the smallest SKILL.md, then adds trigger tests and evals showing it fires on the right requests and stays quiet on its neighbours. Use when creating new skills, editing existing skills, tightening when a skill fires, formalizing repeatable workflows into skills, or verifying skill behavior, even if the user does not say writing-skills."
when_to_use: "Write a new skill, create a skill that makes the agent do something every time, edit or tighten an existing skill, prove a skill fires."
---

# Writing Skills

Primary goal: Every new or changed skill ships with a baseline failure it fixes and proof that it fires on the right requests and stays quiet on its neighbours.

## Overview

**Writing skills IS Test-Driven Development applied to process documentation.**

A skill is not a narrative of how a problem was solved once; it is a reusable, discoverable reference guide that equips future agents with proven techniques, boundaries, and checklists.

## TDD Mapping for Skills

```text
Baseline Test Case (RED) -> Minimal Skill Spec (GREEN) -> Close Loopholes & Rationalizations (REFACTOR)
```

| TDD Concept | Skill Creation Mapping |
| :--- | :--- |
| **Test Case** | Concrete pressure scenario or task brief given to an agent. |
| **Test Fails (RED)** | Run baseline without the skill: watch the agent violate rules or rationalize shortcuts. |
| **Production Code** | The `SKILL.md` document (rules, degrees of freedom, format contracts). |
| **Test Passes (GREEN)** | Agent runs the scenario with the skill loaded and strictly complies. |
| **Refactor Cycle** | Identify new loopholes or rationalizations, tighten constraints, and re-verify. |

---

## Anatomy of a Skill (`SKILL.md`)

Every skill file consists of clear, bounded sections designed for minimal token overhead and maximum behavioral compliance:

### 1. Frontmatter (Discovery Metadata)
Loaded at agent startup. One double-quoted line under 1024 characters, third person, that leads with what the skill does and then says when to use it, with the natural phrases a user types:
```yaml
---
name: skill-name
description: "[What it does, third person]. Use when [specific triggers, natural phrases, user intent], even if the user does not say skill-name."
---
```
Never start the description with `Use when`: the capability comes first. `tests/skill-trigger.test.cjs` (`assertTrigger`) enforces this shape.

Optional `when_to_use`: a second line of trigger phrases, the requests users actually type. Claude Code appends it to the description in the skill listing (both together are cut at 1,536 characters). Add it when another installed plugin ships an overlapping skill: measured with superpowers installed, `superpowers:writing-skills` took "Write a new skill..." 3 of 3 times (0 of 6 for this skill) until this skill had a `when_to_use` line; with it, this skill fired 5 of 6. A sharper description alone and a rename did not help.

### 2. Header & Single Primary Goal
States the single, unambiguous outcome of the skill:
```markdown
# Skill Title

Primary goal: [One clear, testable, single sentence defining done].
```

### 3. Workflow & Flow Diagram
A visual or sequential overview of the execution path:
```text
Step 1 (Input & Baseline) -> Step 2 (Execution) -> Step 3 (Verification & Hand-off)
```

### 4. Steps & Degrees of Freedom
Calibrate the degree of freedom to task fragility:
* **High freedom (Heuristics)**: When multiple approaches work and context guides decisions (e.g., code review, refactoring).
* **Medium freedom (Parameterized steps / Pseudocode)**: When a standard pattern exists with customizable flags.
* **Low freedom / Deterministic (Exact scripts / CLI)**: When operations are fragile (e.g., cryptographic keys, git commit locks, migrations).

### 5. Negative Constraints & Guardrails
State what to do, not just what to avoid:
* Anchor negatives with explicit positive alternatives: *"Instead of deleting deprecated columns, mark them deprecated and create a replacement column."*

### 6. Output Contract
Define the exact shape, headers, or schemas expected so calling agents and human users can parse outputs predictably.

---

## Skill Creation Workflow

1. **Identify the Need**:
   * Repeated friction in sessions, or an entry in `tasks/lessons.md` reaching `Seen: 3+`.
   * Technique is non-obvious and broadly applicable across sessions.
2. **Design the Baseline Pressure Scenario**:
   * Construct a task where an unguided agent fails or makes typical mistakes.
3. **Draft the Minimal `SKILL.md`**:
   * Write concise, actionable instructions addressing the exact observed failures.
4. **Scaffold the Companion Assets**:
   * Put the skill where the project keeps skills: `templates/claude/skills/<name>/` in the moskills repo, `.claude/skills/<name>/` in any other project, or the plugin's `skills/` folder.
   * Add a manual slash command that points to the skill when the project keeps them (`templates/claude/commands/<name>.md` in moskills, `.claude/commands/<name>.md` elsewhere).
   * Exception: when the skill is its own slash command (`/<name>` routes into the skill's sections), create no command file. A same-named command shadows the skill in Claude Code; add a test that asserts the file does not exist instead.
   * In a plugin, register the skill in its manifest (`.claude-plugin/plugin.json`).
5. **Add Automated Verification**:
   * In the moskills repo: trigger assertions in `tests/skill-trigger.test.cjs` (via `assertTrigger`) and the primary goal line in `tests/run-tests.sh`.
   * Write three trigger cases: one direct request, one indirect request, and one neighbour request the skill must stay quiet on. In a plugin, save them as `evals/triggers/<name>-*/case.yaml` tagged with the skill name (neighbour: `min: 0`, `max: 0`; see `docs/evals.md` in moskills).
6. **Verify Compliance**:
   * In a plugin, run `claude plugin eval . --tag <name> --ablation none --runs 3`. Elsewhere, send each trigger case to a fresh session and note which skill fired.
   * Re-run the baseline scenario with the skill active; ensure zero rationalizations.

## Output

Report in this shape, so the user sees proof rather than a claim:

```text
Skill: <name> (<path to SKILL.md>)
Baseline: <what the agent did wrong without it>
Trigger cases: direct <passed>/<runs>, indirect <passed>/<runs>, neighbour quiet <passed>/<runs>
Tests: <command> -> <pass/fail>
Not verified: <what was not run, and why>
```

---

## Rules

- **Token Economy**: Assume the agent is smart. Never explain common programming concepts or library definitions; document only what is unique to this workflow.
- **Third-Person Triggers**: Write descriptions in the third person ("Records...", "the user"), never with `I`, `you` or `your`.
- **Single Goal**: Exactly one primary goal per skill, stated so a reviewer can check it was met. Sub-commands are fine when each one serves that goal; split only when a part would still make sense with the rest deleted.
- **Verification First**: Never ship an untested skill. Always prove that it changes agent behavior on a real scenario.
