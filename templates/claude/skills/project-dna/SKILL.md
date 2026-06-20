---
name: project-dna
description: >
  Tracks every significant implementation decision, configuration, and action taken during a co-development session with Claude — so the exact same work can be reproduced in one shot by a fresh agent.
  
  ALWAYS use this skill when the user says "track this", "log this", "save this", "DNA this", or "wrap up this feature". Also trigger automatically before any git commit or push is detected. Trigger when the user says they want to document what was just built, configured, or decided.
  
  The skill writes structured entries to a PROJECT-DNA.md file (in the project root or a .claude/ folder, or an Obsidian vault if configured), and always ends each entry with a self-contained "Replay Prompt" that a fresh Claude agent could use to reimplement the feature from scratch with full precision.
---

# Project DNA Skill

Captures implementation knowledge as reproducible entries. Each entry is a complete, standalone recipe for reimplementing one feature, config, or decision.

---

## Trigger Modes

### Manual trigger
User says: `"track this"`, `"log this"`, `"DNA this"`, `"save this feature"`, `"wrap this up"`, etc.

### Auto trigger
Detected before: `git commit`, `git push`, or any equivalent (npm version bump, deployment command).
→ Prompt the user: *"Before you commit — want me to write a DNA entry for what we just built?"*

---

## Step 1 — Locate or Initialize the DNA File

1. Check if a `PROJECT-DNA.md` already exists:
   - In `.claude/PROJECT-DNA.md` (preferred for code projects)
   - In project root `PROJECT-DNA.md`
   - In Obsidian vault if user has configured one (look for `.obsidian/` folder nearby)

2. If none exists, ask the user:
   > "Where should I create the DNA file? Options:
   > - `.claude/PROJECT-DNA.md` (hidden, near skill files)
   > - `PROJECT-DNA.md` (project root, visible)
   > - Custom path (Obsidian vault, monorepo subfolder, etc.)"

3. If creating fresh, initialize with the file header (see `references/templates.md` → `FILE_HEADER`).

---

## Step 2 — Gather Entry Information

Before writing, collect all of the following. Pull from conversation history first; ask the user only for what's missing.

### Required fields

| Field | How to collect |
|---|---|
| **Feature/Task name** | From user's description or last few messages |
| **Context** | Why was this needed? What problem does it solve? |
| **Decisions made** | What alternatives were considered? What was chosen and why? |
| **Validations / ACs** | What confirmed it works? Tests passed, manual checks, output seen |
| **Steps** | Exact ordered sequence of actions taken (see Step 3) |
| **Configs** | Env vars, config file values, flags, secrets (redact actual secret values, keep key names) |
| **Outputs** | Files created/modified, endpoints exposed, commands that now work |
| **Dependencies** | npm/pip/cargo packages added, with versions |

### Optional but valuable
- Gotchas or traps encountered
- What was explicitly *not* done (and why)
- Links to docs/issues consulted

---

## Step 3 — Reconstruct the Steps

Steps must be **precise enough that a fresh agent with zero context could follow them**. For each step:

- State the action in imperative form ("Create file X at path Y")
- Include exact file paths (relative to project root)
- Include exact commands with flags
- Include exact config values (redact secrets)
- Include the **reason** if non-obvious

Use this step format:
```
### Step N — [Action Title]
**What:** [what was done]
**Why:** [why this was necessary]
**How:**
```[language]
[exact command or code block]
```
**Result:** [what happened / what to verify]
```

---

## Step 4 — Write the Entry

Append to `PROJECT-DNA.md` using the entry template from `references/templates.md` → `ENTRY_TEMPLATE`.

Entry structure:
```
context → decisions → validations/ACs → steps → configs → outputs → replay prompt
```

Each entry is self-contained. A reader should never need to look at another entry to understand this one.

---

## Step 5 — Generate the Replay Prompt (ALWAYS)

Every entry ends with a `## Replay Prompt` section. This is a single Claude prompt that:

1. Gives full context (stack, project structure, what already exists)
2. States exactly what needs to be built/configured
3. Lists all constraints and decisions already made
4. Includes all relevant config values (redacted secrets as `[SECRET_NAME]`)
5. Asks the agent to follow the exact steps

Format:
```markdown
## 🔁 Replay Prompt

> Paste this into a fresh Claude session to reimplement this feature from scratch.

---
**Context:** [project name, stack, relevant existing files/services]

**Task:** Implement [feature name].

**Constraints & decisions already made:**
- [decision 1]
- [decision 2]

**Steps to follow:**
1. [step 1]
2. [step 2]
...

**Config required:**
- `ENV_VAR_NAME` = `[REDACTED]` (purpose: ...)
- File: `path/to/config.json` → set `key` to `value`

**Done when:** [validation criteria / acceptance conditions]
---
```

---

## Step 6 — Confirm with User

After writing the entry:
1. Show the user the entry in the conversation (summary + replay prompt)
2. Ask: *"Anything missing or incorrect? I can update the entry before you move on."*
3. Apply corrections if needed, then confirm the file is saved.

---

## DNA File Conventions

- Entries are appended in chronological order (newest at bottom, or newest at top if user prefers — ask once, remember in file header)
- Each entry has a unique ID: `DNA-YYYY-MM-DD-NNN` (NNN = sequence number that day)
- File includes a `## Index` section at the top that auto-updates with entry IDs + one-line summaries
- Use `---` horizontal rules between entries
- Secrets: NEVER write actual values. Write `[SECRET: VAR_NAME]` as placeholder.

---

## Edge Cases

**User says "track this" mid-conversation with no clear boundary:**
→ Ask: *"Which part should I track — the full session so far, or just [most recent thing]?"*

**Multiple features were built in one session:**
→ Create one entry per feature. Ask the user to confirm the split before writing.

**The feature spans multiple files with large diffs:**
→ Don't paste full file contents. Instead: file path + what changed (added/modified/deleted) + key code snippets only if critical to reproduction.

**Pre-commit auto-trigger:**
→ If the user is in a hurry, offer: *"Quick DNA or full DNA?"*
- Quick: just steps + replay prompt (skip context/decisions)
- Full: complete entry

---

## Reference Files

- `references/templates.md` — FILE_HEADER and ENTRY_TEMPLATE in copy-paste form
