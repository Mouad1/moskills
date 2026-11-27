# Project DNA — Templates

---

## FILE_HEADER

Use this when initializing a new `PROJECT-DNA.md` file.

```markdown
# 🧬 Project DNA
> Implementation knowledge base — every entry is a reproducible recipe.

**Project:** [project name]
**Stack:** [e.g. NestJS / Angular / MongoDB / TypeScript]
**Entry order:** Newest at bottom
**Created:** [YYYY-MM-DD]

---

## Index

| ID | Date | Feature / Task | Tags |
|---|---|---|---|
| DNA-YYYY-MM-DD-001 | YYYY-MM-DD | [one-line summary] | [tag1, tag2] |

---
```

---

## ENTRY_TEMPLATE

Use this for every new entry. Replace all `[...]` placeholders.

```markdown
---

## [Feature / Task Name]
**ID:** DNA-YYYY-MM-DD-NNN
**Date:** YYYY-MM-DD
**Tags:** [e.g. config, auth, api, infra, frontend, database, ci-cd]
**Status:** ✅ Done | 🚧 In Progress | ⚠️ Partial

---

### 🧭 Context
> Why was this needed? What problem does it solve? What was the state before?

[2–5 sentences. Include the "before" state so a fresh agent knows what they're starting from.]

---

### 🤔 Decisions
> What alternatives were considered? What was chosen and why?

| Option | Chosen? | Reason |
|---|---|---|
| [option A] | ✅ Yes | [why] |
| [option B] | ❌ No | [why not] |

---

### ✅ Validations / Acceptance Criteria
> What confirmed this works?

- [ ] [check 1 — e.g. "Unit tests pass: `npm test`"]
- [ ] [check 2 — e.g. "Endpoint returns 200 at `/api/health`"]
- [ ] [check 3 — e.g. "Manual test: logged in successfully"]

---

### 🪜 Steps

#### Step 1 — [Action Title]
**What:** [what was done]
**Why:** [reason, if non-obvious]
**How:**
```bash
# or any language
[exact command or code]
```
**Result:** [what to see / verify]

#### Step 2 — [Action Title]
[repeat pattern]

---

### ⚙️ Config

> Env vars, config file values, flags. Secrets shown as `[SECRET: VAR_NAME]`.

| Key | Value / Placeholder | File / Scope | Purpose |
|---|---|---|---|
| `VAR_NAME` | `[SECRET: VAR_NAME]` | `.env` | [what it does] |
| `config.key` | `actual-value` | `config/app.json` | [what it does] |

**Dependencies added:**
```
[package-name]@[version]  # reason
```

---

### 📦 Outputs

> Files created or modified, endpoints, commands that now work.

**Files created:**
- `path/to/new-file.ts` — [what it does]

**Files modified:**
- `path/to/existing.ts` — [what changed]

**New capabilities:**
- [e.g. "Run `npm run generate` to scaffold a new module"]
- [e.g. "`POST /api/auth/login` now accepts Bearer tokens"]

---

### ⚠️ Gotchas
> Traps, non-obvious constraints, things that broke before working.

- [gotcha 1]
- [gotcha 2]

---

### 🔁 Replay Prompt

> Paste this into a fresh Claude session to reimplement this feature from scratch.

---

**Context:** [Project name]. Stack: [stack]. Relevant existing files: [list key files/services already in place].

**Task:** Implement [feature name / one-line description].

**Constraints & decisions already made:**
- [decision 1 — e.g. "Use BullMQ over cron for job scheduling"]
- [decision 2]

**Steps to follow:** (one action per step, in the imperative, 20 words or fewer)
1. [one action]
2. [the next action]
3. [the last action]

**Config required:**
- `VAR_NAME` = `[SECRET: VAR_NAME]` — [purpose]
- File `path/to/config` → set `key` to `value`

**Dependencies to install:**
```bash
npm install [package]@[version]
```

**Done when:**
- [AC 1]
- [AC 2]

---
```
